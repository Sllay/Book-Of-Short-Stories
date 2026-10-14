import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PageTextureCache } from '../book/PageTextureCache';
import type { BookDocument, LogicalAnchor } from '../document/BookDocument';
import { firstAnchor } from '../document/BookDocument';
import { importTxt } from '../import/TxtImporter';
import { PaginationEngine } from '../pagination/PaginationEngine';
import type { PageMap } from '../pagination/PageMap';
import { DEFAULT_TYPOGRAPHY, type PaginatedPage, type TypographySettings } from '../pagination/types';
import { loadPdfPublication } from '../pdf/PdfDocumentLoader';
import { PdfPageTextureCache } from '../pdf/PdfPageTextureCache';
import {
  analyzePdfForReader,
  buildPdfReaderPages,
  PdfReaderPageTextureCache,
  type PdfReaderPage,
  type PdfReaderPlan
} from '../pdf/PdfReaderMode';
import type { PdfViewMode } from '../pdf/PdfTypes';
import type { ReaderRenderer } from '../render/ReaderRenderer';

export interface ReadingSessionState {
  readonly title: string;
  readonly page: number;
  readonly pageCount: number;
  readonly busy: boolean;
  readonly message: string;
  readonly fixedLayout: boolean;
  readonly pdfMode: PdfViewMode | null;
}

export interface ReadingProgressSnapshot {
  readonly bookId: string;
  readonly anchor: LogicalAnchor;
  readonly typography: TypographySettings;
  readonly pdfMode: PdfViewMode | null;
}

export interface RestoreReadingState {
  readonly anchor?: LogicalAnchor | null;
  readonly typography?: TypographySettings | null;
  readonly pdfMode?: PdfViewMode | null;
}

export interface PdfPublicationInfo {
  readonly id: string;
  readonly title: string;
  readonly pageCount: number;
  readonly mode: PdfViewMode;
}

interface PdfPublicationState {
  readonly id: string;
  readonly title: string;
}

export class ReadingSession {
  private readonly paginator = new PaginationEngine();
  private documentModel: BookDocument | null = null;
  private pdfPublication: PdfPublicationState | null = null;
  private pdfDocument: PDFDocumentProxy | null = null;
  private pdfReaderPlan: PdfReaderPlan | null = null;
  private pdfReaderPages: readonly PdfReaderPage[] = [];
  private pdfReaderSource: PdfReaderPageTextureCache | null = null;
  private pdfMode: PdfViewMode | null = null;
  private pageMap: PageMap | null = null;
  private pages: readonly PaginatedPage[] = [];
  private typographyState: TypographySettings = { ...DEFAULT_TYPOGRAPHY };
  private stateListener: ((state: ReadingSessionState) => void) | null = null;
  private progressListener: ((snapshot: ReadingProgressSnapshot) => void) | null = null;
  private visualInvalidationListener: (() => void) | null = null;
  private currentLeftPage = 0;
  private pageCount = 0;
  private generation = 0;
  private typographyRevision = 0;
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
  public get fixedLayout(): boolean { return this.pdfPublication !== null && this.pdfMode === 'original'; }
  public get currentPdfMode(): PdfViewMode | null { return this.pdfMode; }

  public get currentAnchor(): LogicalAnchor | null {
    if (this.pdfPublication && this.pdfMode) {
      return {
        chapterId: this.pdfMode === 'reader' ? 'pdf-reader' : 'pdf-original',
        blockId: 'page',
        offset: this.currentLeftPage
      };
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
    this.typographyRevision += 1;
    const previousTypography = this.typographyState;
    if (restore.typography) this.typographyState = { ...DEFAULT_TYPOGRAPHY, ...restore.typography };
    this.renderer.setPageTurnTranslucency(this.typographyState.pageTurnTranslucency);
    this.setBusy(true, 'Abrindo PDF…');

    try {
      const publication = await loadPdfPublication(sourceName, data, knownBookId);
      if (generation !== this.generation) {
        await publication.document.destroy();
        throw new Error('A abertura do PDF foi substituída por outra operação.');
      }

      const requestedMode = restore.pdfMode ?? 'reader';
      let actualMode: PdfViewMode = requestedMode;
      let readerPlan: PdfReaderPlan | null = null;
      let readerPages: readonly PdfReaderPage[] = [];
      let readerSource: PdfReaderPageTextureCache | null = null;
      let source: PdfPageTextureCache | PdfReaderPageTextureCache;
      let targetPage = 0;

      if (requestedMode === 'reader') {
        this.setBusy(true, 'Extraindo texto do PDF…');
        readerPlan = await analyzePdfForReader(publication.document, (completed, total) => {
          if (generation === this.generation && (completed === total || completed % 8 === 0)) {
            this.message = `Extraindo texto… ${completed}/${total}`;
            this.emitState();
          }
        });

        if (readerPlan.textSourcePages > 0) {
          this.setBusy(true, 'Montando Reader Mode…');
          readerPages = await buildPdfReaderPages(readerPlan, this.typographyState, this.paginator);
          readerSource = new PdfReaderPageTextureCache(
            publication.document,
            readerPages,
            this.typographyState,
            () => this.visualInvalidationListener?.()
          );
          source = readerSource;
          targetPage = this.resolveReaderRestorePage(restore.anchor ?? null, readerSource);
        } else {
          actualMode = 'original';
          source = new PdfPageTextureCache(
            publication.document,
            () => this.visualInvalidationListener?.(),
            8,
            1,
            false
          );
          targetPage = this.resolveOriginalRestorePage(restore.anchor ?? null, publication.document.numPages);
        }
      } else {
        source = new PdfPageTextureCache(
          publication.document,
          () => this.visualInvalidationListener?.(),
          8,
          1,
          false
        );
        targetPage = this.resolveOriginalRestorePage(restore.anchor ?? null, publication.document.numPages);
      }

      if (generation !== this.generation) {
        source.dispose();
        await publication.document.destroy();
        throw new Error('A abertura do PDF foi substituída por outra operação.');
      }

      const previousPdfDocument = this.pdfDocument;
      const targetLeftPage = Math.floor(targetPage / 2) * 2;

      this.documentModel = null;
      this.pdfPublication = { id: publication.id, title: publication.title };
      this.pdfDocument = publication.document;
      this.pdfReaderPlan = readerPlan;
      this.pdfReaderPages = readerPages;
      this.pdfReaderSource = readerSource;
      this.pdfMode = actualMode;
      this.pageMap = null;
      this.pages = [];
      this.pageCount = source.pageCount;
      this.currentLeftPage = targetLeftPage;
      this.renderer.setPageTheme(actualMode === 'reader' ? this.typographyState.pageTheme : 'light');
      this.renderer.setPublication(source, targetLeftPage);
      if (previousPdfDocument && previousPdfDocument !== publication.document) {
        void previousPdfDocument.destroy().catch(() => undefined);
      }

      const readyMessage = actualMode === 'reader'
        ? `Reader Mode • ${readerPlan?.textSourcePages ?? 0} páginas de texto`
        : (requestedMode === 'reader' ? 'Sem texto extraível • modo PDF original' : 'PDF original');
      this.setBusy(false, readyMessage);
      this.emitProgress();
      return { id: publication.id, title: publication.title, pageCount: source.pageCount, mode: actualMode };
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

  public async setPdfMode(requestedMode: PdfViewMode): Promise<PdfViewMode> {
    if (!this.pdfPublication || !this.pdfDocument || !this.pdfMode) return requestedMode;
    if (requestedMode === this.pdfMode) return this.pdfMode;

    const generation = ++this.generation;
    this.typographyRevision += 1;
    const sourcePage = this.pdfMode === 'reader'
      ? (this.pdfReaderSource?.sourcePageForReaderIndex(this.currentLeftPage) ?? 0)
      : this.currentLeftPage;
    this.setBusy(true, requestedMode === 'reader' ? 'Preparando Reader Mode…' : 'Voltando ao PDF original…');

    try {
      if (requestedMode === 'reader') {
        const plan = await this.ensureReaderPlan(generation);
        if (generation !== this.generation) return this.pdfMode;
        if (plan.textSourcePages === 0) {
          this.setBusy(false, 'Este PDF não possui texto extraível');
          return 'original';
        }

        const readerPages = await buildPdfReaderPages(plan, this.typographyState, this.paginator);
        if (generation !== this.generation) return this.pdfMode;
        const source = new PdfReaderPageTextureCache(
          this.pdfDocument,
          readerPages,
          this.typographyState,
          () => this.visualInvalidationListener?.()
        );
        const targetPage = source.readerIndexForSourcePage(sourcePage);
        const targetLeftPage = Math.floor(targetPage / 2) * 2;

        this.pdfReaderPages = readerPages;
        this.pdfReaderSource = source;
        this.pdfMode = 'reader';
        this.pageCount = source.pageCount;
        this.currentLeftPage = targetLeftPage;
        this.renderer.setPageTheme(this.typographyState.pageTheme);
        this.renderer.setPublication(source, targetLeftPage);
        this.setBusy(false, 'Reader Mode ativo');
      } else {
        const source = new PdfPageTextureCache(
          this.pdfDocument,
          () => this.visualInvalidationListener?.(),
          8,
          1,
          false
        );
        const targetPage = Math.max(0, Math.min(source.pageCount - 1, sourcePage));
        const targetLeftPage = Math.floor(targetPage / 2) * 2;

        this.pdfReaderSource = null;
        this.pdfMode = 'original';
        this.pageCount = source.pageCount;
        this.currentLeftPage = targetLeftPage;
        this.renderer.setPageTheme('light');
        this.renderer.setPublication(source, targetLeftPage);
        this.setBusy(false, 'PDF original ativo');
      }

      this.emitProgress();
      return this.pdfMode;
    } catch (error: unknown) {
      if (generation === this.generation) this.setBusy(false, 'Falha ao trocar modo do PDF');
      throw error;
    }
  }

  public async loadDocument(
    documentModel: BookDocument,
    anchor: LogicalAnchor | null = null,
    typography: TypographySettings | null = null
  ): Promise<void> {
    const generation = ++this.generation;
    this.typographyRevision += 1;
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
      const previousPdfDocument = this.pdfDocument;

      this.documentModel = documentModel;
      this.clearPdfState(false);
      this.pageMap = result.pageMap;
      this.pages = result.pages;
      this.pageCount = result.pages.length;
      this.currentLeftPage = targetLeftPage;
      this.renderer.setPublication(cache, this.currentLeftPage);
      if (previousPdfDocument) void previousPdfDocument.destroy().catch(() => undefined);

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
    const revision = ++this.typographyRevision;
    const previousSettings = this.typographyState;
    const nextSettings: TypographySettings = { ...DEFAULT_TYPOGRAPHY, ...previousSettings, ...patch };
    this.typographyState = nextSettings;

    if ('pageTurnTranslucency' in patch) {
      this.renderer.setPageTurnTranslucency(nextSettings.pageTurnTranslucency);
    }

    if (this.pdfPublication) {
      if (this.pdfMode === 'original') {
        this.renderer.setPageTheme('light');
        this.emitProgress();
        return;
      }

      if (!this.pdfDocument || !this.pdfReaderPlan || !this.pdfReaderSource) return;
      const sourcePage = this.pdfReaderSource.sourcePageForReaderIndex(this.currentLeftPage);
      const patchKeys = Object.keys(patch) as Array<keyof TypographySettings>;
      const textureOnlyKeys: ReadonlySet<keyof TypographySettings> = new Set([
        'pageNumberScale',
        'pageTurnTranslucency',
        'pageTheme',
        'paperTone',
        'inkTone'
      ]);
      const textureOnlyChange = patchKeys.length > 0 && patchKeys.every((key) => textureOnlyKeys.has(key));
      this.renderer.setPageTheme(nextSettings.pageTheme);

      try {
        let readerPages = this.pdfReaderPages;
        if (!textureOnlyChange) {
          this.setBusy(true, 'Repaginando Reader Mode…');
          readerPages = await buildPdfReaderPages(this.pdfReaderPlan, nextSettings, this.paginator);
        }

        if (revision !== this.typographyRevision || this.typographyState !== nextSettings || this.pdfMode !== 'reader') return;

        const source = new PdfReaderPageTextureCache(
          this.pdfDocument,
          readerPages,
          nextSettings,
          () => this.visualInvalidationListener?.()
        );

        if (revision !== this.typographyRevision || this.typographyState !== nextSettings || this.pdfMode !== 'reader') {
          source.dispose();
          return;
        }

        const targetPage = source.readerIndexForSourcePage(sourcePage);
        const targetLeftPage = Math.floor(targetPage / 2) * 2;

        this.pdfReaderPages = readerPages;
        this.pdfReaderSource = source;
        this.pageCount = source.pageCount;
        this.currentLeftPage = targetLeftPage;
        this.renderer.setPublication(source, targetLeftPage);
        if (this.busy) this.setBusy(false, 'Reader Mode pronto');
        this.emitProgress();
        return;
      } catch (error: unknown) {
        if (revision !== this.typographyRevision || this.typographyState !== nextSettings) return;
        this.typographyState = previousSettings;
        this.renderer.setPageTurnTranslucency(previousSettings.pageTurnTranslucency);
        this.renderer.setPageTheme(previousSettings.pageTheme);
        if (this.busy) this.setBusy(false, 'Falha ao repaginar PDF');
        throw error;
      }
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
    return {
      bookId,
      anchor,
      typography: { ...this.typographyState },
      pdfMode: this.pdfMode
    };
  }

  public dispose(): void {
    this.generation += 1;
    this.typographyRevision += 1;
    const pdfDocument = this.pdfDocument;
    this.clearPdfState(false);
    if (pdfDocument) void pdfDocument.destroy().catch(() => undefined);
    this.renderer.setPageChangeListener(null);
    this.stateListener = null;
    this.progressListener = null;
    this.visualInvalidationListener = null;
  }

  private async ensureReaderPlan(generation: number): Promise<PdfReaderPlan> {
    if (this.pdfReaderPlan) return this.pdfReaderPlan;
    if (!this.pdfDocument) throw new Error('PDF não está aberto.');

    this.setBusy(true, 'Extraindo texto do PDF…');
    const plan = await analyzePdfForReader(this.pdfDocument, (completed, total) => {
      if (generation === this.generation && (completed === total || completed % 8 === 0)) {
        this.message = `Extraindo texto… ${completed}/${total}`;
        this.emitState();
      }
    });
    if (generation === this.generation) this.pdfReaderPlan = plan;
    return plan;
  }

  private resolveReaderRestorePage(anchor: LogicalAnchor | null, source: PdfReaderPageTextureCache): number {
    if (!anchor) return 0;
    if (anchor.chapterId === 'pdf-reader') {
      return Math.max(0, Math.min(source.pageCount - 1, Math.floor(anchor.offset)));
    }
    if (anchor.chapterId === 'pdf-original' || anchor.chapterId === 'pdf') {
      return source.readerIndexForSourcePage(Math.max(0, Math.floor(anchor.offset)));
    }
    return 0;
  }

  private resolveOriginalRestorePage(anchor: LogicalAnchor | null, pageCount: number): number {
    if (!anchor || pageCount < 1) return 0;
    if (anchor.chapterId === 'pdf-original' || anchor.chapterId === 'pdf') {
      return Math.max(0, Math.min(pageCount - 1, Math.floor(anchor.offset)));
    }
    return 0;
  }

  private clearPdfState(destroyDocument: boolean): void {
    const document = this.pdfDocument;
    this.pdfPublication = null;
    this.pdfDocument = null;
    this.pdfReaderPlan = null;
    this.pdfReaderPages = [];
    this.pdfReaderSource = null;
    this.pdfMode = null;
    if (destroyDocument && document) void document.destroy().catch(() => undefined);
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
      fixedLayout: this.fixedLayout,
      pdfMode: this.pdfMode
    });
  }

  private emitProgress(): void {
    const snapshot = this.snapshotProgress();
    if (snapshot) this.progressListener?.(snapshot);
  }
}
