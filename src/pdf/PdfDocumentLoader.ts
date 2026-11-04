import './PdfSafariCompat';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

// Bundled same-origin worker: no CDN, remote fonts or API required to open PDFs.
// Keep its emitted .mjs in the service worker precache (vite.config.ts).
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface LoadedPdfPublication {
  readonly id: string;
  readonly title: string;
  readonly document: PDFDocumentProxy;
}

export async function createPdfBookId(data: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const copy = Uint8Array.from(data).buffer;
    const digest = await globalThis.crypto.subtle.digest('SHA-256', copy);
    const hex = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    return `pdf-${hex.slice(0, 32)}`;
  }

  let hashA = 2166136261 >>> 0;
  let hashB = 2246822519 >>> 0;
  for (let index = 0; index < data.length; index += 1) {
    const byte = data[index];
    hashA ^= byte;
    hashA = Math.imul(hashA, 16777619) >>> 0;
    hashB ^= byte + (index & 0xff);
    hashB = Math.imul(hashB, 3266489917) >>> 0;
  }
  return `pdf-${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}-${data.byteLength}`;
}

export async function loadPdfPublication(
  sourceName: string,
  data: Uint8Array,
  knownBookId?: string
): Promise<LoadedPdfPublication> {
  const id = knownBookId ?? await createPdfBookId(data);
  // Memory-backed input: PDF bytes come directly from the File / OPFS / IndexedDB,
  // not an HTTP URL. Use system font fallback without remote font downloads.
  const loadingTask = getDocument({ data, useSystemFonts: true, disableAutoFetch: true });

  try {
    const document = await loadingTask.promise;
    if (document.numPages < 1) {
      await document.destroy();
      throw new Error('Este PDF não possui páginas legíveis.');
    }

    let title = fileNameWithoutExtension(sourceName) || 'PDF';
    try {
      const metadata = await document.getMetadata();
      const info = metadata.info as unknown as Record<string, unknown>;
      const metadataTitle = typeof info.Title === 'string' ? info.Title.trim() : '';
      if (metadataTitle) title = metadataTitle;
    } catch {
      // Metadata is optional. A malformed metadata dictionary should not block reading.
    }

    return { id, title, document };
  } catch (error: unknown) {
    await loadingTask.destroy().catch(() => undefined);
    const name = error instanceof Error ? error.name : '';
    if (name === 'PasswordException') {
      throw new Error('Este PDF é protegido por senha. PDFs com senha ainda não são suportados.');
    }
    if (error instanceof Error && error.message) {
      if (typeof navigator !== 'undefined' && !navigator.onLine && /worker|import|fetch|network/i.test(error.message)) {
        throw new Error('O componente local do PDF não está em cache neste aparelho. Abra o aplicativo uma vez com internet para instalar a versão offline completa.');
      }
      throw error;
    }
    throw new Error('Não foi possível abrir este PDF.');
  }
}

function fileNameWithoutExtension(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '').trim();
}
