import * as THREE from 'three';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { BookPageSource } from '../book/PageTextureCache';

const PDF_TEXTURE_WIDTH = 1536;
const PDF_TEXTURE_HEIGHT = 2048;
const PAGE_MARGIN = 24;

type RenderState = 'idle' | 'queued' | 'rendering' | 'ready' | 'failed';

interface PdfTextureEntry {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  state: RenderState;
  lastUsed: number;
  renderTask: { readonly promise: Promise<void>; cancel(): void } | null;
}

export class PdfPageTextureCache implements BookPageSource {
  private readonly cache = new Map<number, PdfTextureEntry>();
  private readonly blankTexture: THREE.CanvasTexture;
  private readonly queue: number[] = [];
  private readonly queued = new Set<number>();
  private usageTick = 0;
  private activeRenders = 0;
  private disposed = false;

  public constructor(
    private readonly document: PDFDocumentProxy,
    private readonly onTextureUpdated: () => void,
    private readonly maxEntries = 10,
    private readonly maxConcurrentRenders = 2
  ) {
    const blankCanvas = createPageCanvas();
    const blankContext = blankCanvas.getContext('2d');
    if (!blankContext) throw new Error('Canvas 2D é necessário para renderizar páginas PDF.');
    paintLoadingPage(blankContext);
    this.blankTexture = createCanvasTexture(blankCanvas);
  }

  public get pageCount(): number { return this.document.numPages; }

  public getTexture(pageIndex: number): THREE.Texture {
    if (pageIndex < 0 || pageIndex >= this.pageCount) return this.blankTexture;

    const entry = this.ensureEntry(pageIndex);
    entry.lastUsed = ++this.usageTick;
    this.enqueue(pageIndex, true);
    return entry.texture;
  }

  public warmAround(pageIndex: number): void {
    const order = [0, 1, -1, 2, -2, 3, 4, -3];
    for (const offset of order) {
      const index = pageIndex + offset;
      if (index < 0 || index >= this.pageCount) continue;
      this.ensureEntry(index);
      this.enqueue(index, false);
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.queue.length = 0;
    this.queued.clear();

    for (const entry of this.cache.values()) {
      try { entry.renderTask?.cancel(); } catch { /* render may already be complete */ }
      entry.texture.dispose();
    }
    this.cache.clear();
    this.blankTexture.dispose();
    void this.document.destroy().catch(() => undefined);
  }

  private ensureEntry(pageIndex: number): PdfTextureEntry {
    const existing = this.cache.get(pageIndex);
    if (existing) return existing;

    const canvas = createPageCanvas();
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D é necessário para renderizar páginas PDF.');
    paintLoadingPage(context);

    const entry: PdfTextureEntry = {
      canvas,
      context,
      texture: createCanvasTexture(canvas),
      state: 'idle',
      lastUsed: ++this.usageTick,
      renderTask: null
    };
    this.cache.set(pageIndex, entry);
    this.evictIfNeeded();
    return entry;
  }

  private enqueue(pageIndex: number, priority: boolean): void {
    if (this.disposed) return;
    const entry = this.cache.get(pageIndex);
    if (!entry || entry.state === 'ready' || entry.state === 'rendering' || entry.state === 'failed' || this.queued.has(pageIndex)) return;

    entry.state = 'queued';
    this.queued.add(pageIndex);
    if (priority) this.queue.unshift(pageIndex);
    else this.queue.push(pageIndex);
    this.pumpQueue();
  }

  private pumpQueue(): void {
    if (this.disposed) return;
    while (this.activeRenders < this.maxConcurrentRenders && this.queue.length > 0) {
      const pageIndex = this.queue.shift();
      if (pageIndex === undefined) break;
      this.queued.delete(pageIndex);
      const entry = this.cache.get(pageIndex);
      if (!entry || entry.state !== 'queued') continue;
      entry.state = 'rendering';
      this.activeRenders += 1;
      void this.renderPage(pageIndex, entry).finally(() => {
        this.activeRenders = Math.max(0, this.activeRenders - 1);
        this.evictIfNeeded();
        this.pumpQueue();
      });
    }
  }

  private async renderPage(pageIndex: number, entry: PdfTextureEntry): Promise<void> {
    try {
      const page = await this.document.getPage(pageIndex + 1);
      if (this.disposed || this.cache.get(pageIndex) !== entry) {
        page.cleanup();
        return;
      }

      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = PDF_TEXTURE_WIDTH - PAGE_MARGIN * 2;
      const availableHeight = PDF_TEXTURE_HEIGHT - PAGE_MARGIN * 2;
      const scale = Math.min(
        availableWidth / Math.max(1, baseViewport.width),
        availableHeight / Math.max(1, baseViewport.height)
      );
      const viewport = page.getViewport({ scale });
      const offsetX = (PDF_TEXTURE_WIDTH - viewport.width) * 0.5;
      const offsetY = (PDF_TEXTURE_HEIGHT - viewport.height) * 0.5;

      const context = entry.context;
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, PDF_TEXTURE_WIDTH, PDF_TEXTURE_HEIGHT);
      context.restore();

      const renderTask = page.render({
        canvas: entry.canvas,
        canvasContext: context,
        viewport,
        transform: [1, 0, 0, 1, offsetX, offsetY],
        background: '#ffffff'
      });
      entry.renderTask = renderTask;
      await renderTask.promise;
      entry.renderTask = null;
      page.cleanup();

      if (this.disposed || this.cache.get(pageIndex) !== entry) return;
      entry.state = 'ready';
      entry.texture.needsUpdate = true;
      this.onTextureUpdated();
    } catch (error: unknown) {
      entry.renderTask = null;
      if (this.disposed || this.cache.get(pageIndex) !== entry) return;

      const errorName = error instanceof Error ? error.name : '';
      if (errorName === 'RenderingCancelledException') return;

      entry.state = 'failed';
      paintErrorPage(entry.context, pageIndex + 1);
      entry.texture.needsUpdate = true;
      this.onTextureUpdated();
    }
  }

  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxEntries) return;

    const candidates = [...this.cache.entries()]
      .filter(([, entry]) => entry.state !== 'rendering')
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    while (this.cache.size > this.maxEntries && candidates.length > 0) {
      const oldest = candidates.shift();
      if (!oldest) break;
      const [pageIndex, entry] = oldest;
      this.queued.delete(pageIndex);
      const queuedPosition = this.queue.indexOf(pageIndex);
      if (queuedPosition >= 0) this.queue.splice(queuedPosition, 1);
      this.cache.delete(pageIndex);
      entry.texture.dispose();
    }
  }
}

function createPageCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PDF_TEXTURE_WIDTH;
  canvas.height = PDF_TEXTURE_HEIGHT;
  return canvas;
}

function createCanvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function paintLoadingPage(context: CanvasRenderingContext2D): void {
  context.fillStyle = '#f3efe5';
  context.fillRect(0, 0, PDF_TEXTURE_WIDTH, PDF_TEXTURE_HEIGHT);
}

function paintErrorPage(context: CanvasRenderingContext2D, pageNumber: number): void {
  context.fillStyle = '#f3efe5';
  context.fillRect(0, 0, PDF_TEXTURE_WIDTH, PDF_TEXTURE_HEIGHT);
  context.fillStyle = '#5a5047';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '500 44px system-ui, sans-serif';
  context.fillText(`Não foi possível renderizar a página ${pageNumber}.`, PDF_TEXTURE_WIDTH / 2, PDF_TEXTURE_HEIGHT / 2);
}
