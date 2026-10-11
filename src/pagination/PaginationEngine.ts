import type { BookDocument, BookTextBlock, LogicalAnchor } from '../document/BookDocument';
import { PageMap } from './PageMap';
import {
  PAGE_LOGICAL_HEIGHT,
  PAGE_LOGICAL_WIDTH,
  type PageLine,
  type PaginatedPage,
  type TypographySettings
} from './types';

interface WrappedLine {
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface PaginationResult {
  readonly pages: readonly PaginatedPage[];
  readonly pageMap: PageMap;
}

export class PaginationEngine {
  private readonly context: CanvasRenderingContext2D;

  public constructor() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is required for pagination.');
    this.context = context;
  }

  public async paginate(documentModel: BookDocument, settings: TypographySettings): Promise<PaginationResult> {
    await document.fonts.ready;

    const pages: PaginatedPage[] = [];
    let currentLines: PageLine[] = [];
    let currentY = settings.marginTop;
    const contentWidth = PAGE_LOGICAL_WIDTH - settings.marginX * 2;
    const bottomLimit = PAGE_LOGICAL_HEIGHT - settings.marginBottom;
    let processedBlocks = 0;

    const commitPage = (): void => {
      if (currentLines.length === 0) return;
      const first = currentLines[0];
      const last = currentLines[currentLines.length - 1];
      const start: LogicalAnchor = {
        chapterId: first.chapterId,
        blockId: first.blockId,
        offset: first.startOffset
      };
      const end: LogicalAnchor = {
        chapterId: last.chapterId,
        blockId: last.blockId,
        offset: last.endOffset
      };
      pages.push({ index: pages.length, lines: currentLines, start, end });
      currentLines = [];
      currentY = settings.marginTop;
    };

    for (const chapter of documentModel.chapters) {
      for (const block of chapter.blocks) {
        const isHeading = block.kind === 'heading';
        const fontSize = isHeading ? Math.round(settings.fontSize * 1.24) : settings.fontSize;
        const fontWeight: 400 | 600 = isHeading ? 600 : 400;
        const lineHeightPx = fontSize * (isHeading ? 1.34 : settings.lineHeight);
        const spacingAfter = isHeading ? settings.paragraphSpacing * 1.35 : settings.paragraphSpacing;

        this.context.font = `${fontWeight} ${fontSize}px ${settings.fontFamily}`;
        const wrapped = this.wrapBlock(block, contentWidth);

        if (isHeading && currentLines.length > 0 && currentY + lineHeightPx * Math.min(2, wrapped.length) > bottomLimit) {
          commitPage();
        }

        for (const line of wrapped) {
          if (currentLines.length > 0 && currentY + lineHeightPx > bottomLimit) commitPage();

          currentLines.push({
            chapterId: chapter.id,
            blockId: block.id,
            kind: block.kind,
            text: line.text,
            startOffset: line.startOffset,
            endOffset: line.endOffset,
            x: settings.marginX,
            baselineY: currentY + fontSize,
            fontSize,
            fontWeight
          });
          currentY += lineHeightPx;
        }

        currentY += spacingAfter;
        processedBlocks += 1;

        if (processedBlocks % 12 === 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }
    }

    commitPage();

    if (pages.length === 0) {
      const fallbackBlock = documentModel.chapters[0]?.blocks[0];
      if (!fallbackBlock) throw new Error('The document contains no readable text blocks.');
      const anchor: LogicalAnchor = {
        chapterId: documentModel.chapters[0].id,
        blockId: fallbackBlock.id,
        offset: 0
      };
      pages.push({ index: 0, lines: [], start: anchor, end: anchor });
    }

    return { pages, pageMap: new PageMap(pages) };
  }

  private wrapBlock(block: BookTextBlock, maxWidth: number): WrappedLine[] {
    const words = [...block.text.matchAll(/\S+/g)];
    if (words.length === 0) return [{ text: '', startOffset: 0, endOffset: 0 }];

    const lines: WrappedLine[] = [];
    let lineStart = words[0].index ?? 0;
    let lineEnd = lineStart + words[0][0].length;

    for (let index = 1; index < words.length; index += 1) {
      const word = words[index];
      const wordStart = word.index ?? lineEnd;
      const wordEnd = wordStart + word[0].length;
      const candidate = block.text.slice(lineStart, wordEnd);

      if (this.context.measureText(candidate).width <= maxWidth) {
        lineEnd = wordEnd;
        continue;
      }

      lines.push({
        text: block.text.slice(lineStart, lineEnd).trimEnd(),
        startOffset: lineStart,
        endOffset: lineEnd
      });
      lineStart = wordStart;
      lineEnd = wordEnd;
    }

    lines.push({
      text: block.text.slice(lineStart, lineEnd).trimEnd(),
      startOffset: lineStart,
      endOffset: lineEnd
    });

    return lines;
  }
}
