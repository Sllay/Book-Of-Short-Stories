import * as THREE from 'three';
import type { PaginatedPage, TypographySettings } from '../pagination/types';
import { PAGE_LOGICAL_HEIGHT, PAGE_LOGICAL_WIDTH } from '../pagination/types';

const PAGE_TEXTURE_WIDTH = 1536;
const PAGE_TEXTURE_HEIGHT = 2048;

export function createPageTexture(
  page: PaginatedPage | null,
  settings: TypographySettings,
  pageNumber?: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_TEXTURE_WIDTH;
  canvas.height = PAGE_TEXTURE_HEIGHT;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required to render page textures.');

  const scaleX = PAGE_TEXTURE_WIDTH / PAGE_LOGICAL_WIDTH;
  const scaleY = PAGE_TEXTURE_HEIGHT / PAGE_LOGICAL_HEIGHT;
  context.scale(scaleX, scaleY);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  context.fillStyle = settings.paperTone;
  context.fillRect(0, 0, PAGE_LOGICAL_WIDTH, PAGE_LOGICAL_HEIGHT);

  const innerShade = context.createLinearGradient(0, 0, PAGE_LOGICAL_WIDTH, 0);
  innerShade.addColorStop(0, 'rgba(68, 48, 31, 0.060)');
  innerShade.addColorStop(0.055, 'rgba(68, 48, 31, 0.012)');
  innerShade.addColorStop(0.92, 'rgba(68, 48, 31, 0.004)');
  innerShade.addColorStop(1, 'rgba(68, 48, 31, 0.030)');
  context.fillStyle = innerShade;
  context.fillRect(0, 0, PAGE_LOGICAL_WIDTH, PAGE_LOGICAL_HEIGHT);

  if (page) {
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.fillStyle = settings.inkTone;

    for (const line of page.lines) {
      context.font = `${line.fontWeight} ${line.fontSize}px ${settings.fontFamily}`;
      context.globalAlpha = line.kind === 'heading' ? 0.91 : 0.82;
      context.fillText(line.text, line.x, line.baselineY);
    }
  }

  if (typeof pageNumber === 'number') {
    context.globalAlpha = 0.56;
    context.fillStyle = settings.inkTone;
    context.textAlign = 'center';
    context.font = `400 18px ${settings.fontFamily}`;
    context.fillText(String(pageNumber), PAGE_LOGICAL_WIDTH / 2, PAGE_LOGICAL_HEIGHT - 42);
  }

  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
