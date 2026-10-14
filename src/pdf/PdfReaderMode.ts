import * as THREE from 'three';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { BookDocument, BookTextBlock, TextAlignment } from '../document/BookDocument';
import { disposeTextureMemory, type BookPageSource } from '../book/PageTextureCache';
import { createPageTexture, type PageTextureRenderOptions } from '../book/PageTextureFactory';
import { PaginationEngine } from '../pagination/PaginationEngine';
import type { PaginatedPage, TypographySettings } from '../pagination/types';

const READER_TEXTURE_WIDTH = 1024;
const READER_TEXTURE_HEIGHT = 1365;
const READER_TEXTURE_OPTIONS: PageTextureRenderOptions = {
  width: READER_TEXTURE_WIDTH,
  height: READER_TEXTURE_HEIGHT,
  anisotropy: 8
};

type RenderState = 'idle' | 'queued' | 'rendering' | 'ready' | 'failed';

export interface PdfReaderTextSourcePage {
  readonly kind: 'text';
  readonly sourcePageIndex: number;
  readonly blocks: readonly BookTextBlock[];
}

export interface PdfReaderImageSourcePage {
  readonly kind: 'image';
  readonly sourcePageIndex: number;
}

export type PdfReaderSourcePage = PdfReaderTextSourcePage | PdfReaderImageSourcePage;

export interface PdfReaderPlan {
  readonly pages: readonly PdfReaderSourcePage[];
  readonly textSourcePages: number;
  readonly imageSourcePages: number;
}

export interface PdfReaderTextPage {
  readonly kind: 'text';
  readonly sourcePageIndex: number;
  readonly sourceSubPageIndex: number;
  readonly page: PaginatedPage;
}

export interface PdfReaderImagePage {
  readonly kind: 'image';
  readonly sourcePageIndex: number;
  readonly sourceSubPageIndex: 0;
}

export type PdfReaderPage = PdfReaderTextPage | PdfReaderImagePage;

interface ExtractedItem {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly fontSize: number;
}

interface ExtractedLine {
  readonly text: string;
  readonly xMin: number;
  readonly xMax: number;
  readonly y: number;
  readonly fontSize: number;
  readonly align: TextAlignment;
}

interface BlockDraft {
  readonly text: string;
  readonly align: TextAlignment;
  readonly fontSize: number;
  readonly firstY: number;
  readonly lastY: number;
  readonly lineCount: number;
}

interface HybridCacheEntry {
  readonly texture: THREE.Texture;
  readonly canvas: HTMLCanvasElement | null;
  readonly context: CanvasRenderingContext2D | null;
  state: RenderState;
  lastUsed: number;
  renderTask: { readonly promise: Promise<void>; cancel(): void } | null;
}

export async function analyzePdfForReader(
  document: PDFDocumentProxy,
  onProgress?: (completed: number, total: number) => void
): Promise<PdfReaderPlan> {
  const pages: PdfReaderSourcePage[] = [];
  let textSourcePages = 0;
  let imageSourcePages = 0;

  for (let sourcePageIndex = 0; sourcePageIndex < document.numPages; sourcePageIndex += 1) {
    const page = await document.getPage(sourcePageIndex + 1);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const items = extractItems(textContent.items);
    const rawLines = groupItemsIntoLines(items);
    const lines = rawLines.map((line) => ({
      ...line,
      align: detectAlignment(line.xMin, line.xMax, viewport.width)
    }));

    const readableCharacters = lines.reduce((sum, line) => sum + line.text.replace(/\s/g, '').length, 0);
    const likelyVisualPage = lines.length === 0
      || (sourcePageIndex === 0 && readableCharacters < 220)
      || (lines.length <= 2 && readableCharacters < 100);

    if (likelyVisualPage) {
      pages.push({ kind: 'image', sourcePageIndex });
      imageSourcePages += 1;
    } else {
      const blocks = buildBlocks(lines, sourcePageIndex);
      if (blocks.length === 0) {
        pages.push({ kind: 'image', sourcePageIndex });
        imageSourcePages += 1;
      } else {
        pages.push({ kind: 'text', sourcePageIndex, blocks });
        textSourcePages += 1;
      }
    }

    page.cleanup();
    onProgress?.(sourcePageIndex + 1, document.numPages);
    if ((sourcePageIndex + 1) % 4 === 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  return { pages, textSourcePages, imageSourcePages };
}

export async function buildPdfReaderPages(
  plan: PdfReaderPlan,
  settings: TypographySettings,
  paginator: PaginationEngine,
  onProgress?: (completed: number, total: number) => void
): Promise<readonly PdfReaderPage[]> {
  const output: PdfReaderPage[] = [];

  for (let index = 0; index < plan.pages.length; index += 1) {
    const sourcePage = plan.pages[index];
    if (sourcePage.kind === 'image') {
      output.push({ kind: 'image', sourcePageIndex: sourcePage.sourcePageIndex, sourceSubPageIndex: 0 });
    } else {
      const documentModel: BookDocument = {
        id: `pdf-reader-page-${sourcePage.sourcePageIndex}`,
        metadata: { title: `PDF page ${sourcePage.sourcePageIndex + 1}` },
        chapters: [{
          id: `pdf-page-${sourcePage.sourcePageIndex}`,
          blocks: sourcePage.blocks
        }]
      };
      const result = await paginator.paginate(documentModel, settings);
      result.pages.forEach((page, sourceSubPageIndex) => {
        output.push({
          kind: 'text',
          sourcePageIndex: sourcePage.sourcePageIndex,
          sourceSubPageIndex,
          page
        });
      });
    }

    onProgress?.(index + 1, plan.pages.length);
    if ((index + 1) % 6 === 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  return output;
}

export class PdfReaderPageTextureCache implements BookPageSource {
  private readonly cache = new Map<number, HybridCacheEntry>();
  private readonly blankTexture: THREE.Texture;
  private readonly queue: number[] = [];
  private readonly queued = new Set<number>();
  private readonly warmTimers = new Set<number>();
  private usageTick = 0;
  private activeRenders = 0;
  private disposed = false;

  public constructor(
    private readonly document: PDFDocumentProxy,
    public readonly pages: readonly PdfReaderPage[],
    private readonly settings: TypographySettings,
    private readonly onTextureUpdated: () => void,
    private readonly maxEntries = 6,
    private readonly maxConcurrentRenders = 1
  ) {
    this.blankTexture = createPageTexture(null, settings, undefined, READER_TEXTURE_OPTIONS);
  }

  public get pageCount(): number { return this.pages.length; }

  public getTexture(pageIndex: number): THREE.Texture {
    if (pageIndex < 0 || pageIndex >= this.pages.length) return this.blankTexture;
    const entry = this.ensureEntry(pageIndex);
    entry.lastUsed = ++this.usageTick;
    if (this.pages[pageIndex].kind === 'image') this.enqueue(pageIndex, true);
    return entry.texture;
  }

  public warmAround(pageIndex: number): void {
    const order = [0, 1, -1, 2, -2, 3];
    let scheduled = 0;

    for (const offset of order) {
      const index = pageIndex + offset;
      if (index < 0 || index >= this.pages.length || this.cache.has(index)) continue;

      const timer = window.setTimeout(() => {
        this.warmTimers.delete(timer);
        if (this.disposed) return;
        this.ensureEntry(index);
        if (this.pages[index].kind === 'image') this.enqueue(index, false);
      }, scheduled * 48);
      this.warmTimers.add(timer);
      scheduled += 1;
    }
  }

  public sourcePageForReaderIndex(readerPageIndex: number): number {
    if (this.pages.length === 0) return 0;
    const index = THREE.MathUtils.clamp(Math.floor(readerPageIndex), 0, this.pages.length - 1);
    return this.pages[index]?.sourcePageIndex ?? 0;
  }

  public readerIndexForSourcePage(sourcePageIndex: number): number {
    const exact = this.pages.findIndex((page) => page.sourcePageIndex === sourcePageIndex);
    if (exact >= 0) return exact;

    const after = this.pages.findIndex((page) => page.sourcePageIndex > sourcePageIndex);
    if (after >= 0) return after;
    return Math.max(0, this.pages.length - 1);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.queue.length = 0;
    this.queued.clear();
    for (const timer of this.warmTimers) window.clearTimeout(timer);
    this.warmTimers.clear();

    for (const entry of this.cache.values()) {
      try { entry.renderTask?.cancel(); } catch { /* already complete */ }
      disposeTextureMemory(entry.texture);
    }
    this.cache.clear();
    disposeTextureMemory(this.blankTexture);
  }

  private ensureEntry(pageIndex: number): HybridCacheEntry {
    const existing = this.cache.get(pageIndex);
    if (existing) return existing;

    const descriptor = this.pages[pageIndex];
    let entry: HybridCacheEntry;

    if (descriptor.kind === 'text') {
      entry = {
        texture: createPageTexture(descriptor.page, this.settings, pageIndex, READER_TEXTURE_OPTIONS),
        canvas: null,
        context: null,
        state: 'ready',
        lastUsed: ++this.usageTick,
        renderTask: null
      };
    } else {
      const canvas = createPdfCanvas();
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D é necessário para renderizar imagens do PDF.');
      paintLoadingImagePage(context, this.settings.pageTheme === 'dark');
      entry = {
        texture: createCanvasTexture(canvas),
        canvas,
        context,
        state: 'idle',
        lastUsed: ++this.usageTick,
        renderTask: null
      };
    }

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
      void this.renderImagePage(pageIndex, entry).finally(() => {
        this.activeRenders = Math.max(0, this.activeRenders - 1);
        this.evictIfNeeded();
        this.pumpQueue();
      });
    }
  }

  private async renderImagePage(readerPageIndex: number, entry: HybridCacheEntry): Promise<void> {
    const descriptor = this.pages[readerPageIndex];
    if (descriptor.kind !== 'image' || !entry.canvas || !entry.context) return;

    try {
      const page = await this.document.getPage(descriptor.sourcePageIndex + 1);
      if (this.disposed || this.cache.get(readerPageIndex) !== entry) {
        page.cleanup();
        return;
      }

      const baseViewport = page.getViewport({ scale: 1 });
      const fullBleed = descriptor.sourcePageIndex === 0;
      const scale = fullBleed
        ? Math.max(READER_TEXTURE_WIDTH / Math.max(1, baseViewport.width), READER_TEXTURE_HEIGHT / Math.max(1, baseViewport.height))
        : Math.min(READER_TEXTURE_WIDTH / Math.max(1, baseViewport.width), READER_TEXTURE_HEIGHT / Math.max(1, baseViewport.height));
      const viewport = page.getViewport({ scale });
      const offsetX = (READER_TEXTURE_WIDTH - viewport.width) * 0.5;
      const offsetY = (READER_TEXTURE_HEIGHT - viewport.height) * 0.5;

      entry.context.setTransform(1, 0, 0, 1, 0, 0);
      entry.context.fillStyle = '#ffffff';
      entry.context.fillRect(0, 0, READER_TEXTURE_WIDTH, READER_TEXTURE_HEIGHT);

      const renderTask = page.render({
        canvas: entry.canvas,
        canvasContext: entry.context,
        viewport,
        transform: [1, 0, 0, 1, offsetX, offsetY],
        background: '#ffffff'
      });
      entry.renderTask = renderTask;
      await renderTask.promise;
      entry.renderTask = null;
      page.cleanup();

      if (this.disposed || this.cache.get(readerPageIndex) !== entry) return;
      entry.state = 'ready';
      entry.texture.needsUpdate = true;
      this.onTextureUpdated();
    } catch (error: unknown) {
      entry.renderTask = null;
      if (this.disposed || this.cache.get(readerPageIndex) !== entry || !entry.context) return;
      const errorName = error instanceof Error ? error.name : '';
      if (errorName === 'RenderingCancelledException') return;
      entry.state = 'failed';
      paintImageError(entry.context, descriptor.sourcePageIndex + 1);
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
      disposeTextureMemory(entry.texture);
    }
  }
}

function extractItems(items: readonly unknown[]): ExtractedItem[] {
  const extracted: ExtractedItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || !('str' in item) || !('transform' in item)) continue;
    const candidate = item as {
      readonly str?: unknown;
      readonly transform?: unknown;
      readonly width?: unknown;
      readonly height?: unknown;
    };
    if (typeof candidate.str !== 'string' || !Array.isArray(candidate.transform)) continue;
    const text = candidate.str.replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const transform = candidate.transform.map((value) => typeof value === 'number' ? value : 0);
    const x = transform[4] ?? 0;
    const y = transform[5] ?? 0;
    const rawFontSize = Math.hypot(transform[2] ?? 0, transform[3] ?? 0) || Math.abs(transform[0] ?? 0);
    const measuredFontSize = rawFontSize || (typeof candidate.height === 'number' ? candidate.height : 10);
    const fontSize = THREE.MathUtils.clamp(measuredFontSize, 1, 72);
    const width = typeof candidate.width === 'number' && Number.isFinite(candidate.width)
      ? Math.abs(candidate.width)
      : Math.max(fontSize * 0.45, text.length * fontSize * 0.45);

    extracted.push({ text, x, y, width, fontSize });
  }
  return extracted;
}

function groupItemsIntoLines(items: readonly ExtractedItem[]): Omit<ExtractedLine, 'align'>[] {
  const sorted = [...items].sort((a, b) => {
    const groupingFont = Math.min(36, Math.max(a.fontSize, b.fontSize));
    if (Math.abs(a.y - b.y) > groupingFont * 0.35) return b.y - a.y;
    return a.x - b.x;
  });

  const groups: Array<{ y: number; items: ExtractedItem[] }> = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    const tolerance = Math.max(2, Math.min(item.fontSize, 36) * 0.48);
    if (!last || Math.abs(last.y - item.y) > tolerance) {
      groups.push({ y: item.y, items: [item] });
    } else {
      last.items.push(item);
      last.y = (last.y * (last.items.length - 1) + item.y) / last.items.length;
    }
  }

  return groups.map((group) => {
    const lineItems = [...group.items].sort((a, b) => a.x - b.x);
    let text = '';
    let previousEnd = Number.NEGATIVE_INFINITY;
    let fontTotal = 0;
    let xMin = Number.POSITIVE_INFINITY;
    let xMax = Number.NEGATIVE_INFINITY;

    for (const item of lineItems) {
      const gap = item.x - previousEnd;
      if (text && gap > Math.max(1.2, item.fontSize * 0.16) && !/^[,.;:!?%)\]}]/.test(item.text)) text += ' ';
      text += item.text;
      previousEnd = Math.max(previousEnd, item.x + item.width);
      fontTotal += item.fontSize;
      xMin = Math.min(xMin, item.x);
      xMax = Math.max(xMax, item.x + item.width);
    }

    return {
      text: text.replace(/\s+([,.;:!?])/g, '$1').trim(),
      xMin: Number.isFinite(xMin) ? xMin : 0,
      xMax: Number.isFinite(xMax) ? xMax : 0,
      y: group.y,
      fontSize: lineItems.length > 0 ? fontTotal / lineItems.length : 10
    };
  }).filter((line) => line.text.length > 0);
}

function detectAlignment(xMin: number, xMax: number, pageWidth: number): TextAlignment {
  const width = Math.max(1, pageWidth);
  const center = (xMin + xMax) * 0.5;
  const leftGap = Math.max(0, xMin);
  const rightGap = Math.max(0, width - xMax);
  const centerDelta = Math.abs(center - width * 0.5) / width;

  if (centerDelta <= 0.055 && Math.min(leftGap, rightGap) > width * 0.075) return 'center';
  if (rightGap < leftGap * 0.58 && rightGap < width * 0.17) return 'right';
  return 'left';
}

function buildBlocks(lines: readonly ExtractedLine[], sourcePageIndex: number): BookTextBlock[] {
  if (lines.length === 0) return [];
  const medianFontSize = median(lines.map((line) => line.fontSize));
  const drafts: BlockDraft[] = [];
  let current: ExtractedLine[] = [];

  const flush = (): void => {
    if (current.length === 0) return;
    const first = current[0];
    const last = current[current.length - 1];
    const fontSize = median(current.map((line) => line.fontSize));
    const text = joinBlockLines(current.map((line) => line.text));
    drafts.push({
      text,
      align: dominantAlignment(current),
      fontSize,
      firstY: first.y,
      lastY: last.y,
      lineCount: current.length
    });
    current = [];
  };

  for (const line of lines) {
    const previous = current[current.length - 1];
    if (!previous) {
      current.push(line);
      continue;
    }

    const verticalGap = previous.y - line.y;
    const referenceFont = Math.min(42, Math.max(previous.fontSize, line.fontSize));
    const compactGap = referenceFont * 1.5;
    const continuationGap = referenceFont * 1.9;
    const sentenceContinues = !endsWithTerminalPunctuation(previous.text) && startsLikeContinuation(line.text);
    const sameBlock = verticalGap <= compactGap || (sentenceContinues && verticalGap <= continuationGap);

    if (!sameBlock) flush();
    current.push(line);
  }
  flush();

  const mergedDrafts = mergeContinuationDrafts(drafts);

  return mergedDrafts.map((draft, index) => {
    const next = mergedDrafts[index + 1];
    const previous = mergedDrafts[index - 1];
    const sourceFontRatio = draft.fontSize / Math.max(1, medianFontSize);
    const previousGapRatio = previous
      ? Math.max(0, previous.lastY - draft.firstY) / Math.max(1, Math.max(previous.fontSize, draft.fontSize))
      : Number.POSITIVE_INFINITY;
    const nextGapRatio = next
      ? Math.max(0, draft.lastY - next.firstY) / Math.max(1, Math.max(draft.fontSize, next.fontSize))
      : Number.POSITIVE_INFINITY;

    const words = draft.text.trim().split(/\s+/).filter(Boolean).length;
    const explicitHeading = /^(cap[ií]tulo|chapter|parte|part|pr[oó]logo|ep[ií]logo|pref[aá]cio|introdu[cç][aã]o|conclus[aã]o)\b/i.test(draft.text.trim());
    const dialogueLike = /^[\s“"'‘’]*[—–-]\s*/.test(draft.text);
    const sentenceLike = words > 12 || endsWithTerminalPunctuation(draft.text);
    const shortBlock = draft.text.length <= 96 && draft.lineCount <= 3;
    const isolated = previousGapRatio > 1.8 && nextGapRatio > 1.8;
    const centeredCandidate = draft.align === 'center' && sourceFontRatio >= 1.14;
    const stronglyLargerCandidate = sourceFontRatio >= 1.38;
    const heading = explicitHeading || (
      !dialogueLike
      && !sentenceLike
      && shortBlock
      && isolated
      && (centeredCandidate || stronglyLargerCandidate)
    );
    const visualScale = heading
      ? THREE.MathUtils.clamp(1.04 + Math.max(0, sourceFontRatio - 1) * 0.06, 1.04, 1.09)
      : undefined;

    let spacingBefore = 0;
    if (previous) {
      if (previousGapRatio > 2.7) spacingBefore = 24;
      else if (previousGapRatio > 2.05) spacingBefore = 15;
      else if (previousGapRatio > 1.6) spacingBefore = 8;
    }

    let spacingAfter: number | undefined;
    if (next) {
      if (nextGapRatio < 1.3) spacingAfter = 5;
      else if (heading) spacingAfter = 9;
    } else if (heading) {
      spacingAfter = 7;
    }

    return {
      id: `pdf-${sourcePageIndex}-block-${index}`,
      kind: heading ? 'heading' : 'paragraph',
      text: draft.text,
      align: draft.align,
      spacingBefore,
      spacingAfter,
      visualScale
    } satisfies BookTextBlock;
  });
}

function mergeContinuationDrafts(drafts: readonly BlockDraft[]): BlockDraft[] {
  const merged: BlockDraft[] = [];

  for (const draft of drafts) {
    const previous = merged[merged.length - 1];
    if (!previous) {
      merged.push(draft);
      continue;
    }

    const gapRatio = Math.max(0, previous.lastY - draft.firstY)
      / Math.max(1, Math.max(previous.fontSize, draft.fontSize));
    const continuation = gapRatio <= 2.05
      && !endsWithTerminalPunctuation(previous.text)
      && startsLikeContinuation(draft.text);

    if (!continuation) {
      merged.push(draft);
      continue;
    }

    merged[merged.length - 1] = {
      text: joinBlockLines([previous.text, draft.text]),
      align: previous.text.length >= draft.text.length ? previous.align : draft.align,
      fontSize: median([previous.fontSize, draft.fontSize]),
      firstY: previous.firstY,
      lastY: draft.lastY,
      lineCount: previous.lineCount + draft.lineCount
    };
  }

  return merged;
}

function dominantAlignment(lines: readonly ExtractedLine[]): TextAlignment {
  const weights: Record<TextAlignment, number> = {
    left: 0,
    center: 0,
    right: 0,
    justify: 0
  };

  for (const line of lines) weights[line.align] += Math.max(1, line.text.length);

  let best: TextAlignment = 'left';
  for (const align of ['center', 'right', 'justify'] as const) {
    if (weights[align] > weights[best]) best = align;
  }
  return best;
}

function startsLikeContinuation(text: string): boolean {
  return /^[\s“"'‘’(\[]*[a-záéíóúàèìòùâêîôûãõç]/.test(text.trimStart());
}

function endsWithTerminalPunctuation(text: string): boolean {
  return /[.!?…][\s”"'’)]*$/.test(text.trim());
}

function joinBlockLines(lines: readonly string[]): string {
  let text = '';
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!text) {
      text = line;
      continue;
    }

    if (/[-‐‑–]$/.test(text) && /^[a-zá-úà-ùâ-ûãõç]/i.test(line)) {
      text = text.slice(0, -1) + line;
    } else {
      text += ` ${line}`;
    }
  }
  return text.replace(/\s+/g, ' ').trim();
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) * 0.5 : sorted[middle];
}

function createPdfCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = READER_TEXTURE_WIDTH;
  canvas.height = READER_TEXTURE_HEIGHT;
  return canvas;
}

function createCanvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 6;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function paintLoadingImagePage(context: CanvasRenderingContext2D, dark: boolean): void {
  context.fillStyle = dark ? '#171615' : '#f3efe5';
  context.fillRect(0, 0, READER_TEXTURE_WIDTH, READER_TEXTURE_HEIGHT);
}

function paintImageError(context: CanvasRenderingContext2D, sourcePageNumber: number): void {
  context.fillStyle = '#f3efe5';
  context.fillRect(0, 0, READER_TEXTURE_WIDTH, READER_TEXTURE_HEIGHT);
  context.fillStyle = '#5a5047';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '500 36px system-ui, sans-serif';
  context.fillText(`Não foi possível renderizar a imagem da página ${sourcePageNumber}.`, READER_TEXTURE_WIDTH / 2, READER_TEXTURE_HEIGHT / 2);
}
