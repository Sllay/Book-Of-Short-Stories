import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

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

  // Deterministic fallback for older embedded browsers. It samples the whole file
  // without retaining a second large allocation in memory.
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
  const loadingTask = getDocument({ data });

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
    if (error instanceof Error && error.message) throw error;
    throw new Error('Não foi possível abrir este PDF.');
  }
}

function fileNameWithoutExtension(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '').trim();
}
