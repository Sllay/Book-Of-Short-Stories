import { PageTextureCache } from '../book/PageTextureCache';
import type { BookDocument, LogicalAnchor } from '../document/BookDocument';
import { firstAnchor } from '../document/BookDocument';
import { importTxt } from '../import/TxtImporter';
import { PaginationEngine } from '../pagination/PaginationEngine';
import type { PageMap } from '../pagination/PageMap';
import { DEFAULT_TYPOGRAPHY, type PaginatedPage, type TypographySettings } from '../pagination/types';
import { loadPdfPublication } from '../pdf/PdfDocumentLoader';
import { PdfPageTextureCache } from '../pdf/PdfPageTextureCache';
import type { ReaderRenderer } from '../render/ReaderRenderer';

export interface ReadingSessionState {
  readonly title: string;
  readonly page: number;
  readonly pageCount: number;
  readonly busy: boolean;
  readonly message: string;
  readonly fixedLayout: boolean;
}

export interface ReadingProgressSnapshot {
  readonly bookId: string;
  readonly anchor: LogicalAnchor;
  readonly typography: TypographySettings;
}

export interface RestoreReadingState {
  readonly anchor?: LogicalAnchor | null;
  readonly typography?: TypographySettings | null;
}

export interface PdfPublicationInfo {
  readonly id: string;
  readonly title: string;
  readonly pageCount: number;
}

interface PdfPublicationState {
  readonly id: string;
  readonly title: string;
}

export class ReadingSession {
  private readonly paginator = new PaginationEngine();
  private documentModel: BookDocument | null = null;
  private pdfPublication: PdfPublicationState | null = null;
  private pageMap: PageMap | null = null;
  private pages: readonly PaginatedPage[] = [];
  private typographyState: TypographySettings = { ...DEFAULT_TYPOGRAPHY };
  private stateListener: ((state: ReadingSessionState) => void) | null = null;
  private progressListener: ((snapshot: ReadingProgressSnapshot) => void) | null = null;
  private visualInvalidationListener: (() => void) | null = null;
  private currentLeftPage = 0;
  private pageCount = 0;
  private generation = 0;
  private busy = false;
  private message = 'Preparando leitor…';

  public constructor(private readonly renderer: ReaderRenderer) {
    this.renderer.setPageChangeListener((pageIndex) => {
      this.currentLeftPage = pageIndex;
      this.emitState();
      this.emitProgress();
    });
    this.renderer.setPageTurnTranslucency(this.typographyState.pageTurnTranslucency);
    this.renderer.setPageTheme(this.typographyState.pageTheme);
  }

  public get typography(): TypographySettings { return this.typographyState; }
  public get currentBookId(): string | null { return this.documentModel?.id ?? this.pdfPublication?.id ?? null; }
  public get fixedLayout(): boolean { return this.pdfPublication !== null; }

  public get currentAnchor(): LogicalAnchor | null {
    if (this.pdfPublication) {
      return { chapterId: 'pdf', blockId: 'page', offset: this.currentLeftPage };
    }
    if (!this.pageMap || !this.documentModel) return null;
    return this.pageMap.getPageStart(this.currentLeftPage);
  }

  public setStateListener(listener: ((state: ReadingSessionState) => void) | null): void {
    this.stateListener = listener;
    this.emitState();
  }

  public setProgressListener(listener: ((snapshot: ReadingProgressSnapshot) => void) | null): void {
    this.progressListener = listener;
    this.emitProgress();
  }

  public setVisualInvalidationListener(listener: (() => void) | null): void {
    this.visualInvalidationListener = listener;
  }

  public async importTxtFile(file: File, restore: RestoreReadingState = {}): Promise<BookDocument> {
    if (!file.name.toLowerCase().endsWith('.txt') && file.type !== 'text/plain') {
      throw new Error('Este arquivo não é um TXT válido.');
    }

    this.setBusy(true, 'Lendo TXT…');
    try {
      const text = await file.text();
      return await this.openTxtSource(file.name, text, restore);
    } catch (error: unknown) {
      if (this.busy) this.setBusy(false, 'Falha ao abrir TXT');
      throw error;
    }
  }

  public async openTxtSource(sourceName: string, sourceText: string, restore: RestoreReadingState = {}): Promise<BookDocument> {
    const documentModel = importTxt(sourceName, sourceText);
    await this.loadDocument(documentModel, restore.anchor ?? null, restore.typography ?? null);
    return documentModel;
  }

  public async openPdfSource(
    sourceName: string,
    data: Uint8Array,
    restore: RestoreReadingState = {},
    knownBookId?: string
  ): Promise<PdfPublicationInfo> {
    const generation = ++this.generation;
    const previousTypography = this.typographyState;
    if (restore.typography) this.typographyState = { ...DEFAULT_TYPOGRAPHY, ...restore.typography };
    this.renderer.setPageTurnTranslucency(this.typographyState.pageTurnTranslucency);
    // PDFs are fixed-layout documents. Preserve the source pixels instead of applying
    // the TXT paper theme over them; the physical world lighting still affects the mesh.
    this.renderer.setPageTheme('light');
    this.setBusy(true, 'Abrindo PDF…');

    try {
      const publication = await loadPdfPublication(sourceName, data, knownBookId);
      if (generation !== this.generation) {
        await publication.document.destroy();
        throw new Error('A abertura do PDF foi substituída por outra operação.');
      }

      const requestedPage = restore.anchor?.chapterId === 'pdf'
        ? restore.anchor.offset
        : 0;
      const targetPage = Math.max(0, Math.min(publication.document.numPages - 1, Math.floor(requestedPage)));
      const targetLeftPage = Math.floor(targetPage / 2) * 2;
      const cache = new PdfPageTextureCache(
        publication.document,
        () => this.visualInvalidationListener?.()
      );

      this.documentModel = null;
      this.pdfPublication = { id: publication.id, title: publication.title };
      this.pageMap = null;
      this.pages = [];
      this.pageCount = publication.document.numPages;
      this.currentLeftPage = targetLeftPage;
      this.renderer.setPublication(cache, targetLeftPage);
      cache.warmAround(targetLeftPage);

      this.setBusy(false, 'PDF pronto');
      this.emitProgress();
      return { id: publication.id, title: publication.title, pageCount: publication.document.numPages };
    } catch (error: unknown) {
      if (generation === this.generation) {
        this.typographyState = previousTypography;
        this.renderer.setPageTurnTranslucency(previousTypography.pageTurnTranslucency);
        this.renderer.setPageTheme(previousTypography.pageTheme);
        this.setBusy(false, 'Falha ao abrir PDF');
      }
      throw error;
    }
  }

  public async loadDocument(
    documentModel: BookDocument,
    anchor: LogicalAnchor | null = null,
    typography: TypographySettings | null = null
  ): Promise<void> {
    const generation = ++this.generation;
    const previousTypography = this.typographyState;
    if (typography) this.typographyState = { ...DEFAULT_TYPOGRAPHY, ...typography };
    const settings = this.typographyState;
    this.renderer.setPageTurnTranslucency(settings.pageTurnTranslucency);
    this.renderer.setPageTheme(settings.pageTheme);
    this.setBusy(true, 'Paginando livro…');

    try {
      const result = await this.paginator.paginate(documentModel, settings);
      if (generation !== this.generation) return;

      const targetAnchor = anchor ?? firstAnchor(documentModel);
      const targetPage = targetAnchor ? result.pageMap.findPageForAnchor(targetAnchor) : 0;
      const targetLeftPage = Math.floor(targetPage / 2) * 2;
      const cache = new PageTextureCache(result.pages, settings);

      this.documentModel = documentModel;
      this.pdfPublication = null;
      this.pageMap = result.pageMap;
      this.pages = result.pages;
      this.pageCount = result.pages.length;
      this.currentLeftPage = targetLeftPage;
      this.renderer.setPublication(cache, this.currentLeftPage);
      cache.warmAround(this.currentLeftPage);

      this.setBusy(false, 'Pronto');
      this.emitProgress();
    } catch (error: unknown) {
      if (generation === this.generation) {
        if (typography) {
          this.typographyState = previousTypography;
          this.renderer.setPageTurnTranslucency(previousTypography.pageTurnTranslucency);
          this.renderer.setPageTheme(previousTypography.pageTheme);
        }
        this.setBusy(false, 'Falha ao paginar');
      }
      throw error;
    }
  }

  public async updateTypography(patch: Partial<TypographySettings>): Promise<void> {
    const previousSettings = this.typographyState;
    const nextSettings: TypographySettings = { ...DEFAULT_TYPOGRAPHY, ...previousSettings, ...patch };
    this.typographyState = nextSettings;

    if ('pageTurnTranslucency' in patch) {
      this.renderer.setPageTurnTranslucency(nextSettings.pageTurnTranslucency);
    }

    if (this.pdfPublication) {
      // Fixed PDF pages keep their authored pixels. Store reader preferences for when a
      // reflowable book is opened again, but do not mutate or repaginate the PDF.
      this.renderer.setPageTheme('light');
      this.emitProgress();
      return;
    }

    if (!this.documentModel) return;
    const documentModel = this.documentModel;
    const anchor = this.currentAnchor ?? firstAnchor(documentModel);

    if ('pageTheme' in patch) {
      this.renderer.setPageTheme(nextSettings.pageTheme);
    }

    const patchKeys = Object.keys(patch) as Array<keyof TypographySettings>;
    const visualOnlyKeys: ReadonlySet<keyof TypographySettings> = new Set([
      'pageNumberScale',
      'pageTurnTranslucency',
      'pageTheme',
      'paperTone',
      'inkTone'
    ]);
    const textureKeys: ReadonlySet<keyof TypographySettings> = new Set([
      'pageNumberScale',
      'pageTheme',
      'paperTone',
      'inkTone'
    ]);
    const visualOnlyChange = patchKeys.length > 0 && patchKeys.every((key) => visualOnlyKeys.has(key));

    if (visualOnlyChange) {
      if (patchKeys.some((key) => textureKeys.has(key)) && this.pages.length > 0) {
        const cache = new PageTextureCache(this.pages, nextSettings);
        this.renderer.setPublication(cache, this.currentLeftPage);
        cache.warmAround(this.currentLeftPage);
      }
      this.emitProgress();
      return;
    }

    try {
      await this.loadDocument(documentModel, anchor);
    } catch (error: unknown) {
      if (this.typographyState === nextSettings) {
        this.typographyState = previousSettings;
        this.renderer.setPageTurnTranslucency(previousSettings.pageTurnTranslucency);
        this.renderer.setPageTheme(previousSettings.pageTheme);
      }
      throw error;
    }
  }

  public snapshotProgress(): ReadingProgressSnapshot | null {
    const bookId = this.currentBookId;
    const anchor = this.currentAnchor;
    if (!bookId || !anchor) return null;
    return { bookId, anchor, typography: { ...this.typographyState } };
  }

  public dispose(): void {
    this.generation += 1;
    this.renderer.setPageChangeListener(null);
    this.stateListener = null;
    this.progressListener = null;
    this.visualInvalidationListener = null;
  }

  private setBusy(busy: boolean, message: string): void {
    this.busy = busy;
    this.message = message;
    this.emitState();
  }

  private emitState(): void {
    this.stateListener?.({
      title: this.documentModel?.metadata.title ?? this.pdfPublication?.title ?? 'Book of Short Stories',
      page: Math.min(this.currentLeftPage + 1, Math.max(1, this.pageCount)),
      pageCount: this.pageCount,
      busy: this.busy,
      message: this.message,
      fixedLayout: this.pdfPublication !== null
    });
  }

  private emitProgress(): void {
    const snapshot = this.snapshotProgress();
    if (snapshot) this.progressListener?.(snapshot);
  }
}
