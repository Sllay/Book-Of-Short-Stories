import * as THREE from 'three';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { BookCoverArtwork } from '../book/BookPresentationController';
import { loadPdfPublication } from './PdfDocumentLoader';

const TARGET_HEIGHT = 896;
const COLOR_BUCKET = 32;
const CLUSTER_DISTANCE = 58;

interface BorderSample {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface BucketStats {
  count: number;
  red: number;
  green: number;
  blue: number;
}

export async function createPdfCoverArtworkFromBytes(
  sourceName: string,
  data: Uint8Array,
  knownBookId: string
): Promise<BookCoverArtwork> {
  const publication = await loadPdfPublication(sourceName, data, knownBookId);
  try {
    return await createPdfCoverArtwork(publication.document);
  } finally {
    await publication.document.destroy().catch(() => undefined);
  }
}

export async function createPdfCoverArtwork(document: PDFDocumentProxy): Promise<BookCoverArtwork> {
  const page = await document.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = TARGET_HEIGHT / Math.max(1, baseViewport.height);
  const viewport = page.getViewport({ scale });

  const canvas = window.document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D indisponível para gerar a capa do PDF.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({
    canvas,
    canvasContext: context,
    viewport,
    background: '#ffffff'
  }).promise;
  page.cleanup();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return {
    texture,
    edgeColor: sampleDominantBorderColor(context, canvas.width, canvas.height)
  };
}

function sampleDominantBorderColor(context: CanvasRenderingContext2D, width: number, height: number): number {
  const borderX = Math.max(3, Math.floor(width * 0.065));
  const borderY = Math.max(3, Math.floor(height * 0.065));
  const pixels = context.getImageData(0, 0, width, height).data;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 260));
  const samples: BorderSample[] = [];
  const buckets = new Map<string, BucketStats>();

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (x >= borderX && x < width - borderX && y >= borderY && y < height - borderY) continue;
      const offset = (y * width + x) * 4;
      const sample: BorderSample = {
        r: pixels[offset],
        g: pixels[offset + 1],
        b: pixels[offset + 2]
      };
      samples.push(sample);

      const key = bucketKey(sample);
      const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
      bucket.count += 1;
      bucket.red += sample.r;
      bucket.green += sample.g;
      bucket.blue += sample.b;
      buckets.set(key, bucket);
    }
  }

  if (samples.length === 0 || buckets.size === 0) return 0x5a3526;

  let dominant: BucketStats | null = null;
  for (const bucket of buckets.values()) {
    if (!dominant || bucket.count > dominant.count) dominant = bucket;
  }
  if (!dominant || dominant.count <= 0) return 0x5a3526;

  const seed = {
    r: dominant.red / dominant.count,
    g: dominant.green / dominant.count,
    b: dominant.blue / dominant.count
  };

  let red = 0;
  let green = 0;
  let blue = 0;
  let weight = 0;
  for (const sample of samples) {
    const distance = Math.hypot(sample.r - seed.r, sample.g - seed.g, sample.b - seed.b);
    if (distance > CLUSTER_DISTANCE) continue;
    const closeness = 1 - distance / CLUSTER_DISTANCE;
    const sampleWeight = 0.35 + closeness * closeness * 0.65;
    red += sample.r * sampleWeight;
    green += sample.g * sampleWeight;
    blue += sample.b * sampleWeight;
    weight += sampleWeight;
  }

  if (weight <= 0) return 0x5a3526;
  const color = new THREE.Color(
    Math.round(red / weight) / 255,
    Math.round(green / weight) / 255,
    Math.round(blue / weight) / 255
  );

  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(
    hsl.h,
    THREE.MathUtils.clamp(hsl.s, 0, 0.82),
    THREE.MathUtils.clamp(hsl.l, 0.055, 0.84)
  );
  return color.getHex();
}

function bucketKey(sample: BorderSample): string {
  return `${Math.floor(sample.r / COLOR_BUCKET)}:${Math.floor(sample.g / COLOR_BUCKET)}:${Math.floor(sample.b / COLOR_BUCKET)}`;
}
