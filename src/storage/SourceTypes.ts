export type BookSourceType = 'txt' | 'pdf' | 'epub' | 'markdown' | 'html' | 'unknown';

export function detectBookSourceType(fileName: string, mimeType = ''): BookSourceType {
  const name = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();

  if (name.endsWith('.txt') || mime === 'text/plain') return 'txt';
  if (name.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  if (name.endsWith('.epub') || mime === 'application/epub+zip') return 'epub';
  if (name.endsWith('.md') || name.endsWith('.markdown') || mime === 'text/markdown') return 'markdown';
  if (name.endsWith('.html') || name.endsWith('.htm') || mime === 'text/html') return 'html';
  return 'unknown';
}

export function sourceTypeLabel(sourceType: BookSourceType): string {
  switch (sourceType) {
    case 'txt': return 'TXT';
    case 'pdf': return 'PDF';
    case 'epub': return 'EPUB';
    case 'markdown': return 'Markdown';
    case 'html': return 'HTML';
    default: return 'Arquivo';
  }
}
