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

export class ReadingSession {
  private readonly paginator = new PaginationEngine();
  private documentModel: BookDocument | null = null;
  private pageMap: PageMap | null = null;
  private typographyState: TypographySettings = { ...DEFAULT_TYPOGRAPHY };
  private stateListener: ((state: ReadingSessionState) => void) | null = null;
  private currentLeftPage = 0;
  private pageCount = 0;
  private generation = 0;
  private busy = false;
  private message = 'Preparando leitor…';

  public constructor(private readonly renderer: ReaderRenderer) {
    this.renderer.setPageChangeListener((pageIndex) => {
      this.currentLeftPage = pageIndex;
      this.emitState();
    });
  }

  public get typography(): TypographySettings { return this.typographyState; }

  public setStateListener(listener: ((state: ReadingSessionState) => void) | null): void {
    this.stateListener = listener;
    this.emitState();
  }

  public async importTxtFile(file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith('.txt') && file.type !== 'text/plain') {
      throw new Error('A V1.3 aceita arquivos TXT nesta etapa.');
    }

    this.setBusy(true, 'Lendo TXT…');
    try {
      const text = await file.text();
      const documentModel = importTxt(file.name, text);
      await this.loadDocument(documentModel);
    } catch (error: unknown) {
      // If parsing fails before loadDocument takes ownership, never leave the controls
      // permanently disabled. The previous publication remains available.
      if (this.busy) this.setBusy(false, 'Falha ao abrir TXT');
      throw error;
    }
  }

  public async loadDocument(documentModel: BookDocument, anchor: LogicalAnchor | null = null): Promise<void> {
    const generation = ++this.generation;
    const settings = this.typographyState;
    this.setBusy(true, 'Paginando livro…');

    try {
      const result = await this.paginator.paginate(documentModel, settings);
      if (generation !== this.generation) return;

      const targetAnchor = anchor ?? firstAnchor(documentModel);
      const targetPage = targetAnchor ? result.pageMap.findPageForAnchor(targetAnchor) : 0;
      const targetLeftPage = Math.floor(targetPage / 2) * 2;
      const cache = new PageTextureCache(result.pages, settings);

      // Commit the new session only after pagination has succeeded. This keeps the
      // currently readable book intact if a malformed or extreme import fails.
      this.documentModel = documentModel;
      this.pageMap = result.pageMap;
      this.pageCount = result.pages.length;
      this.currentLeftPage = targetLeftPage;
      this.renderer.setPublication(cache, this.currentLeftPage);
      cache.warmAround(this.currentLeftPage);

      this.setBusy(false, 'Pronto');
    } catch (error: unknown) {
      if (generation === this.generation) this.setBusy(false, 'Falha ao paginar');
      throw error;
    }
  }

  public async updateTypography(patch: Partial<TypographySettings>): Promise<void> {
    if (!this.documentModel) return;

    const documentModel = this.documentModel;
    const anchor = this.pageMap?.getPageStart(this.currentLeftPage) ?? firstAnchor(documentModel);
    const previousSettings = this.typographyState;
    const nextSettings: TypographySettings = { ...previousSettings, ...patch };
    this.typographyState = nextSettings;

    try {
      // Do not discard a later slider change just because an earlier pagination pass
      // is still running. generation makes stale results harmless and the last change wins.
      await this.loadDocument(documentModel, anchor);
    } catch (error: unknown) {
      if (this.typographyState === nextSettings) this.typographyState = previousSettings;
      throw error;
    }
  }

  public dispose(): void {
    this.generation += 1;
    this.renderer.setPageChangeListener(null);
    this.stateListener = null;
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
}
