import * as THREE from 'three';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { BookCoverArtwork } from '../book/BookPresentationController';

const TARGET_HEIGHT = 1024;

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

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return {
    texture,
    edgeColor: sampleBorderColor(context, canvas.width, canvas.height)
  };
}

function sampleBorderColor(context: CanvasRenderingContext2D, width: number, height: number): number {
  const sampleWidth = Math.max(2, Math.floor(width * 0.045));
  const sampleHeight = Math.max(2, Math.floor(height * 0.045));
  const image = context.getImageData(0, 0, width, height).data;
  let red = 0;
  let green = 0;
  let blue = 0;
  let weight = 0;

  const addPixel = (x: number, y: number): void => {
    const offset = (y * width + x) * 4;
    const r = image[offset];
    const g = image[offset + 1];
    const b = image[offset + 2];
    const luminance = (r + g + b) / 3;
    const saturation = Math.max(r, g, b) - Math.min(r, g, b);
    const pixelWeight = luminance > 247 && saturation < 8 ? 0.18 : 1;
    red += r * pixelWeight;
    green += g * pixelWeight;
    blue += b * pixelWeight;
    weight += pixelWeight;
  };

  const step = Math.max(1, Math.floor(Math.min(width, height) / 220));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (x < sampleWidth || x >= width - sampleWidth || y < sampleHeight || y >= height - sampleHeight) {
        addPixel(x, y);
      }
    }
  }

  if (weight <= 0) return 0x5a3526;
  const color = new THREE.Color(
    Math.round(red / weight) / 255,
    Math.round(green / weight) / 255,
    Math.round(blue / weight) / 255
  );

  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(hsl.h, Math.min(0.72, Math.max(0.12, hsl.s)), Math.min(0.56, Math.max(0.18, hsl.l * 0.82)));
  return color.getHex();
}
