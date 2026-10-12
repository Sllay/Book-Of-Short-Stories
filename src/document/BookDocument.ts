export type BookBlockKind = 'heading' | 'paragraph';
export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

export interface BookMetadata {
  readonly title: string;
  readonly author?: string;
  readonly language?: string;
  readonly sourceName?: string;
}

export interface BookTextBlock {
  readonly id: string;
  readonly kind: BookBlockKind;
  readonly text: string;
  readonly align?: TextAlignment;
  readonly spacingBefore?: number;
  readonly spacingAfter?: number;
}

export interface BookChapter {
  readonly id: string;
  readonly title?: string;
  readonly blocks: readonly BookTextBlock[];
}

export interface BookDocument {
  readonly id: string;
  readonly metadata: BookMetadata;
  readonly chapters: readonly BookChapter[];
}

export interface LogicalAnchor {
  readonly chapterId: string;
  readonly blockId: string;
  readonly offset: number;
}

export function firstAnchor(document: BookDocument): LogicalAnchor | null {
  for (const chapter of document.chapters) {
    const block = chapter.blocks[0];
    if (block) return { chapterId: chapter.id, blockId: block.id, offset: 0 };
  }
  return null;
}
