import type { BookBlockKind, LogicalAnchor, TextAlignment } from '../document/BookDocument';

export type PageTheme = 'light' | 'dark';

export interface TypographySettings {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly marginX: number;
  readonly marginTop: number;
  readonly marginBottom: number;
  readonly paragraphSpacing: number;
  readonly pageNumberScale: number;
  readonly pageTurnTranslucency: boolean;
  readonly pageTheme: PageTheme;
  readonly paperTone: string;
  readonly inkTone: string;
}

export interface PageLine {
  readonly chapterId: string;
  readonly blockId: string;
  readonly kind: BookBlockKind;
  readonly align: TextAlignment;
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly x: number;
  readonly baselineY: number;
  readonly fontSize: number;
  readonly fontWeight: 400 | 600;
}

export interface PaginatedPage {
  readonly index: number;
  readonly lines: readonly PageLine[];
  readonly start: LogicalAnchor;
  readonly end: LogicalAnchor;
}

export const PAGE_LOGICAL_WIDTH = 768;
export const PAGE_LOGICAL_HEIGHT = 1024;

export const DEFAULT_TYPOGRAPHY: TypographySettings = {
  fontFamily: 'Georgia, serif',
  fontSize: 27,
  lineHeight: 1.48,
  marginX: 92,
  marginTop: 92,
  marginBottom: 90,
  paragraphSpacing: 18,
  pageNumberScale: 1,
  pageTurnTranslucency: false,
  pageTheme: 'light',
  paperTone: '#f2ead7',
  inkTone: '#40362d'
};
