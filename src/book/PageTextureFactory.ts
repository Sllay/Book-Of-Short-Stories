import * as THREE from 'three';

const PAGE_TEXTURE_WIDTH = 768;
const PAGE_TEXTURE_HEIGHT = 1024;

export function createDemoPageTexture(pageNumber: number, heading: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_TEXTURE_WIDTH;
  canvas.height = PAGE_TEXTURE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is required to create demo page textures.');

  context.fillStyle = '#f2ead7';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, 'rgba(82, 58, 36, 0.08)');
  gradient.addColorStop(0.08, 'rgba(82, 58, 36, 0.015)');
  gradient.addColorStop(0.92, 'rgba(82, 58, 36, 0.01)');
  gradient.addColorStop(1, 'rgba(82, 58, 36, 0.045)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = '#3e342b';
  context.textAlign = 'center';
  context.font = '600 28px Georgia, serif';
  context.fillText(heading, canvas.width / 2, 118);

  context.fillStyle = 'rgba(62, 52, 43, 0.68)';
  context.font = '20px Georgia, serif';
  const widths = [0.82, 0.91, 0.76, 0.88, 0.94, 0.71, 0.86, 0.79, 0.92, 0.74, 0.9, 0.83, 0.69, 0.89];
  const left = 104;
  const usableWidth = canvas.width - left * 2;
  let y = 205;
  for (let paragraph = 0; paragraph < 3; paragraph += 1) {
    for (let line = 0; line < widths.length; line += 1) {
      if (y > 870) break;
      const width = usableWidth * widths[(line + paragraph * 3) % widths.length];
      context.fillRect(left, y, width, 3);
      y += 28;
    }
    y += 24;
  }

  context.fillStyle = '#54483b';
  context.font = '22px Georgia, serif';
  context.fillText(String(pageNumber), canvas.width / 2, 965);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
