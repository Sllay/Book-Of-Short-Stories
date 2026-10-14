import type { BookDocument, BookTextBlock, LogicalAnchor, TextAlignment } from '../document/BookDocument';
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

interface TextPiece {
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

    if (contentWidth <= 16 || bottomLimit <= settings.marginTop + 16) {
      throw new Error('As margens atuais não deixam espaço suficiente para o texto.');
    }

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
        const hasSourceScale = typeof block.visualScale === 'number';
        const visualScale = Math.max(0.92, Math.min(1.24, block.visualScale ?? (isHeading ? 1.24 : 1)));
        const fontSize = Math.max(1, Math.round(settings.fontSize * visualScale));
        const fontWeight: 400 | 600 = isHeading ? 600 : 400;
        const headingLineHeight = hasSourceScale ? 1.25 : 1.34;
        const lineHeightPx = fontSize * (isHeading ? headingLineHeight : settings.lineHeight);
        const defaultSpacingAfter = isHeading
          ? settings.paragraphSpacing * (hasSourceScale ? 0.78 : 1.35)
          : settings.paragraphSpacing;
        const spacingBefore = Math.max(0, block.spacingBefore ?? 0);
        const spacingAfter = Math.max(0, block.spacingAfter ?? defaultSpacingAfter);
        const align = block.align ?? 'left';

        this.context.font = `${fontWeight} ${fontSize}px ${settings.fontFamily}`;
        const wrapped = this.wrapBlock(block, contentWidth);

        if (currentLines.length > 0 && spacingBefore > 0) {
          if (currentY + spacingBefore + lineHeightPx > bottomLimit) commitPage();
          else currentY += spacingBefore;
        }

        if (isHeading && currentLines.length > 0 && currentY + lineHeightPx * Math.min(2, wrapped.length) > bottomLimit) {
          commitPage();
        }

        for (const line of wrapped) {
          if (currentLines.length > 0 && currentY + lineHeightPx > bottomLimit) commitPage();
          const measuredWidth = this.context.measureText(line.text).width;

          currentLines.push({
            chapterId: chapter.id,
            blockId: block.id,
            kind: block.kind,
            align,
            text: line.text,
            startOffset: line.startOffset,
            endOffset: line.endOffset,
            x: this.alignedX(align, measuredWidth, contentWidth, settings.marginX),
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
      const fallbackChapter = documentModel.chapters[0];
      const fallbackBlock = fallbackChapter?.blocks[0];
      if (!fallbackChapter || !fallbackBlock) throw new Error('The document contains no readable text blocks.');
      const anchor: LogicalAnchor = {
        chapterId: fallbackChapter.id,
        blockId: fallbackBlock.id,
        offset: 0
      };
      pages.push({ index: 0, lines: [], start: anchor, end: anchor });
    }

    return { pages, pageMap: new PageMap(pages) };
  }

  private alignedX(align: TextAlignment, lineWidth: number, contentWidth: number, marginX: number): number {
    if (align === 'center') return marginX + Math.max(0, (contentWidth - lineWidth) * 0.5);
    if (align === 'right') return marginX + Math.max(0, contentWidth - lineWidth);
    return marginX;
  }

  private wrapBlock(block: BookTextBlock, maxWidth: number): WrappedLine[] {
    const pieces = this.createFittablePieces(block.text, maxWidth);
    if (pieces.length === 0) return [{ text: '', startOffset: 0, endOffset: 0 }];

    const lines: WrappedLine[] = [];
    let lineStart = pieces[0].startOffset;
    let lineEnd = pieces[0].endOffset;

    for (let index = 1; index < pieces.length; index += 1) {
      const piece = pieces[index];
      const candidate = block.text.slice(lineStart, piece.endOffset);

      if (this.context.measureText(candidate).width <= maxWidth) {
        lineEnd = piece.endOffset;
        continue;
      }

      lines.push({
        text: block.text.slice(lineStart, lineEnd).trimEnd(),
        startOffset: lineStart,
        endOffset: lineEnd
      });
      lineStart = piece.startOffset;
      lineEnd = piece.endOffset;
    }

    lines.push({
      text: block.text.slice(lineStart, lineEnd).trimEnd(),
      startOffset: lineStart,
      endOffset: lineEnd
    });

    return lines;
  }

  private createFittablePieces(text: string, maxWidth: number): TextPiece[] {
    const pieces: TextPiece[] = [];

    for (const match of text.matchAll(/\S+/g)) {
      const token = match[0];
      const tokenStart = match.index ?? 0;
      const tokenEnd = tokenStart + token.length;

      if (this.context.measureText(token).width <= maxWidth) {
        pieces.push({ startOffset: tokenStart, endOffset: tokenEnd });
        continue;
      }

      let segmentStart = tokenStart;
      let segmentEnd = tokenStart;
      for (const character of Array.from(token)) {
        const nextEnd = segmentEnd + character.length;
        const candidate = text.slice(segmentStart, nextEnd);

        if (segmentEnd > segmentStart && this.context.measureText(candidate).width > maxWidth) {
          pieces.push({ startOffset: segmentStart, endOffset: segmentEnd });
          segmentStart = segmentEnd;
        }
        segmentEnd = nextEnd;
      }

      if (segmentEnd > segmentStart) pieces.push({ startOffset: segmentStart, endOffset: segmentEnd });
    }

    return pieces;
  }
}
