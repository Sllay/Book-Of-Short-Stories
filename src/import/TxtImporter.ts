import type { BookDocument, BookTextBlock } from '../document/BookDocument';

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeParagraph(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function looksLikeHeading(text: string): boolean {
  if (text.length === 0 || text.length > 72) return false;
  if (/^[A-ZÀ-Ý0-9][A-ZÀ-Ý0-9\s\-—:,.!?]+$/.test(text) && /[A-ZÀ-Ý]/.test(text)) return true;
  return /^(cap[ií]tulo|chapter|parte|part|pr[oó]logo|prologue|ep[ií]logo|epilogue)\b/i.test(text);
}

export function importTxt(sourceName: string, sourceText: string): BookDocument {
  const cleanText = sourceText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  const chunks = cleanText.length > 0 ? cleanText.split(/\n\s*\n+/g) : ['Livro vazio'];
  const blocks: BookTextBlock[] = [];

  for (const chunk of chunks) {
    const text = normalizeParagraph(chunk);
    if (!text) continue;
    blocks.push({
      id: `block-${String(blocks.length + 1).padStart(5, '0')}`,
      kind: looksLikeHeading(text) ? 'heading' : 'paragraph',
      text
    });
  }

  const title = sourceName.replace(/\.[^.]+$/, '').trim() || 'Livro sem título';
  const id = `txt-${stableHash(`${sourceName}\n${cleanText}`)}`;

  return {
    id,
    metadata: { title, sourceName },
    chapters: [{ id: 'chapter-00001', title, blocks }]
  };
}
