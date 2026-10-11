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
    const text = await file.text();
    const documentModel = importTxt(file.name, text);
    await this.loadDocument(documentModel);
  }

  public async loadDocument(documentModel: BookDocument, anchor: LogicalAnchor | null = null): Promise<void> {
    const generation = ++this.generation;
    this.documentModel = documentModel;
    this.setBusy(true, 'Paginando livro…');

    const result = await this.paginator.paginate(documentModel, this.typographyState);
    if (generation !== this.generation) return;

    this.pageMap = result.pageMap;
    this.pageCount = result.pages.length;

    const targetAnchor = anchor ?? firstAnchor(documentModel);
    const targetPage = targetAnchor ? result.pageMap.findPageForAnchor(targetAnchor) : 0;
    this.currentLeftPage = Math.floor(targetPage / 2) * 2;

    const cache = new PageTextureCache(result.pages, this.typographyState);
    this.renderer.setPublication(cache, this.currentLeftPage);
    cache.warmAround(this.currentLeftPage);

    this.setBusy(false, 'Pronto');
  }

  public async updateTypography(patch: Partial<TypographySettings>): Promise<void> {
    if (!this.documentModel || this.busy) return;

    const anchor = this.pageMap?.getPageStart(this.currentLeftPage) ?? firstAnchor(this.documentModel);
    this.typographyState = { ...this.typographyState, ...patch };
    await this.loadDocument(this.documentModel, anchor);
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
