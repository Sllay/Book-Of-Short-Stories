import { PageTextureCache } from '../book/PageTextureCache';
import type { BookDocument, LogicalAnchor } from '../document/BookDocument';
import { firstAnchor } from '../document/BookDocument';
import { importTxt } from '../import/TxtImporter';
import { PaginationEngine } from '../pagination/PaginationEngine';
import type { PageMap } from '../pagination/PageMap';
import { DEFAULT_TYPOGRAPHY, type TypographySettings } from '../pagination/types';
import type { ReaderRenderer } from '../render/ReaderRenderer';

export interface ReadingSessionState {
  readonly title: string;
  readonly page: number;
  readonly pageCount: number;
  readonly busy: boolean;
  readonly message: string;
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

export class ReadingSession {
  private readonly paginator = new PaginationEngine();
  private documentModel: BookDocument | null = null;
  private pageMap: PageMap | null = null;
  private typographyState: TypographySettings = { ...DEFAULT_TYPOGRAPHY };
  private stateListener: ((state: ReadingSessionState) => void) | null = null;
  private progressListener: ((snapshot: ReadingProgressSnapshot) => void) | null = null;
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
  }

  public get typography(): TypographySettings { return this.typographyState; }
  public get currentBookId(): string | null { return this.documentModel?.id ?? null; }

  public get currentAnchor(): LogicalAnchor | null {
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

  public async importTxtFile(file: File, restore: RestoreReadingState = {}): Promise<BookDocument> {
    if (!file.name.toLowerCase().endsWith('.txt') && file.type !== 'text/plain') {
      throw new Error('A V1.4 aceita TXT como formato de leitura nesta etapa.');
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

  public async loadDocument(
    documentModel: BookDocument,
    anchor: LogicalAnchor | null = null,
    typography: TypographySettings | null = null
  ): Promise<void> {
    const generation = ++this.generation;
    const previousTypography = this.typographyState;
    if (typography) this.typographyState = { ...typography };
    const settings = this.typographyState;
    this.setBusy(true, 'Paginando livro…');

    try {
      const result = await this.paginator.paginate(documentModel, settings);
      if (generation !== this.generation) return;

      const targetAnchor = anchor ?? firstAnchor(documentModel);
      const targetPage = targetAnchor ? result.pageMap.findPageForAnchor(targetAnchor) : 0;
      const targetLeftPage = Math.floor(targetPage / 2) * 2;
      const cache = new PageTextureCache(result.pages, settings);

      this.documentModel = documentModel;
      this.pageMap = result.pageMap;
      this.pageCount = result.pages.length;
      this.currentLeftPage = targetLeftPage;
      this.renderer.setPublication(cache, this.currentLeftPage);
      cache.warmAround(this.currentLeftPage);

      this.setBusy(false, 'Pronto');
      this.emitProgress();
    } catch (error: unknown) {
      if (generation === this.generation) {
        if (typography) this.typographyState = previousTypography;
        this.setBusy(false, 'Falha ao paginar');
      }
      throw error;
    }
  }

  public async updateTypography(patch: Partial<TypographySettings>): Promise<void> {
    if (!this.documentModel) return;

    const documentModel = this.documentModel;
    const anchor = this.currentAnchor ?? firstAnchor(documentModel);
    const previousSettings = this.typographyState;
    const nextSettings: TypographySettings = { ...previousSettings, ...patch };
    this.typographyState = nextSettings;

    try {
      await this.loadDocument(documentModel, anchor);
    } catch (error: unknown) {
      if (this.typographyState === nextSettings) this.typographyState = previousSettings;
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
  }

  private setBusy(busy: boolean, message: string): void {
    this.busy = busy;
    this.message = message;
    this.emitState();
  }

  private emitState(): void {
    this.stateListener?.({
      title: this.documentModel?.metadata.title ?? 'Book of Short Stories',
      page: Math.min(this.currentLeftPage + 1, Math.max(1, this.pageCount)),
      pageCount: this.pageCount,
      busy: this.busy,
      message: this.message
    });
  }

  private emitProgress(): void {
    const snapshot = this.snapshotProgress();
    if (snapshot) this.progressListener?.(snapshot);
  }
}
