import * as THREE from 'three';

const PAGE_TEXTURE_WIDTH = 1536;
const PAGE_TEXTURE_HEIGHT = 2048;
const LOGICAL_WIDTH = 768;
const LOGICAL_HEIGHT = 1024;

export function createDemoPageTexture(pageNumber: number, heading: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_TEXTURE_WIDTH;
  canvas.height = PAGE_TEXTURE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is required to create demo page textures.');

  context.scale(PAGE_TEXTURE_WIDTH / LOGICAL_WIDTH, PAGE_TEXTURE_HEIGHT / LOGICAL_HEIGHT);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  context.fillStyle = '#f2ead7';
  context.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  const gradient = context.createLinearGradient(0, 0, LOGICAL_WIDTH, 0);
  gradient.addColorStop(0, 'rgba(82, 58, 36, 0.07)');
  gradient.addColorStop(0.08, 'rgba(82, 58, 36, 0.012)');
  gradient.addColorStop(0.92, 'rgba(82, 58, 36, 0.008)');
  gradient.addColorStop(1, 'rgba(82, 58, 36, 0.04)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  // Crisp edges, softer ink contrast. The final reader will use live DOM/CSS text
  // while pages are stationary; this texture is only a V1.2 visual placeholder.
  context.fillStyle = 'rgba(58, 49, 41, 0.84)';
  context.textAlign = 'center';
  context.font = '600 28px Georgia, serif';
  context.fillText(heading, LOGICAL_WIDTH / 2, 118);

  context.fillStyle = 'rgba(58, 49, 41, 0.46)';
  const widths = [0.82, 0.91, 0.76, 0.88, 0.94, 0.71, 0.86, 0.79, 0.92, 0.74, 0.9, 0.83, 0.69, 0.89];
  const left = 104;
  const usableWidth = LOGICAL_WIDTH - left * 2;
  let y = 205;
  for (let paragraph = 0; paragraph < 3; paragraph += 1) {
    for (let line = 0; line < widths.length; line += 1) {
      if (y > 870) break;
      const width = usableWidth * widths[(line + paragraph * 3) % widths.length];
      context.fillRect(left, y, width, 2.25);
      y += 28;
    }
    y += 24;
  }

  context.fillStyle = 'rgba(67, 57, 47, 0.72)';
  context.font = '22px Georgia, serif';
  context.fillText(String(pageNumber), LOGICAL_WIDTH / 2, 965);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;

  // Text-like page content benefits more from preserving the high-resolution base
  // level than from aggressive mip smoothing at the modest viewing angles of a book.
  // This keeps stationary pages noticeably sharper on 2x mobile displays.
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
