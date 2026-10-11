import type { LogicalAnchor } from '../document/BookDocument';
import type { PaginatedPage } from './types';

interface BlockRange {
  readonly pageIndex: number;
  readonly startOffset: number;
  readonly endOffset: number;
}

export class PageMap {
  private readonly rangesByBlock = new Map<string, BlockRange[]>();

  public constructor(private readonly pages: readonly PaginatedPage[]) {
    for (const page of pages) {
      const local = new Map<string, { start: number; end: number }>();
      for (const line of page.lines) {
        const existing = local.get(line.blockId);
        if (existing) {
          existing.start = Math.min(existing.start, line.startOffset);
          existing.end = Math.max(existing.end, line.endOffset);
        } else {
          local.set(line.blockId, { start: line.startOffset, end: line.endOffset });
        }
      }

      for (const [blockId, range] of local) {
        const list = this.rangesByBlock.get(blockId) ?? [];
        list.push({ pageIndex: page.index, startOffset: range.start, endOffset: range.end });
        this.rangesByBlock.set(blockId, list);
      }
    }
  }

  public get pageCount(): number { return this.pages.length; }

  public getPageStart(pageIndex: number): LogicalAnchor {
    const index = Math.min(Math.max(0, pageIndex), Math.max(0, this.pages.length - 1));
    return this.pages[index].start;
  }

  public findPageForAnchor(anchor: LogicalAnchor): number {
    const ranges = this.rangesByBlock.get(anchor.blockId);
    if (!ranges || ranges.length === 0) return 0;

    for (const range of ranges) {
      if (anchor.offset >= range.startOffset && anchor.offset <= range.endOffset) return range.pageIndex;
    }

    let best = ranges[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const range of ranges) {
      const distance = anchor.offset < range.startOffset
        ? range.startOffset - anchor.offset
        : anchor.offset - range.endOffset;
      if (distance < bestDistance) {
        best = range;
        bestDistance = distance;
      }
    }
    return best.pageIndex;
  }
}
