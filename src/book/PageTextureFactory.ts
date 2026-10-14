import * as THREE from 'three';
import type { PaginatedPage, TypographySettings } from '../pagination/types';
import { PAGE_LOGICAL_HEIGHT, PAGE_LOGICAL_WIDTH } from '../pagination/types';

const DEFAULT_PAGE_TEXTURE_WIDTH = 1536;
const DEFAULT_PAGE_TEXTURE_HEIGHT = 2048;
const DARK_PAPER = '#171615';
const DARK_INK = '#eee9df';

export interface PageTextureRenderOptions {
  readonly width?: number;
  readonly height?: number;
  readonly anisotropy?: number;
}

export function createPageTexture(
  page: PaginatedPage | null,
  settings: TypographySettings,
  pageIndex?: number,
  options: PageTextureRenderOptions = {}
): THREE.CanvasTexture {
  const textureWidth = Math.max(384, Math.floor(options.width ?? DEFAULT_PAGE_TEXTURE_WIDTH));
  const textureHeight = Math.max(512, Math.floor(options.height ?? DEFAULT_PAGE_TEXTURE_HEIGHT));
  const canvas = document.createElement('canvas');
  canvas.width = textureWidth;
  canvas.height = textureHeight;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required to render page textures.');

  const scaleX = textureWidth / PAGE_LOGICAL_WIDTH;
  const scaleY = textureHeight / PAGE_LOGICAL_HEIGHT;
  context.scale(scaleX, scaleY);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const dark = settings.pageTheme === 'dark';
  const paperTone = dark ? DARK_PAPER : settings.paperTone;
  const inkTone = dark ? DARK_INK : settings.inkTone;

  context.fillStyle = paperTone;
  context.fillRect(0, 0, PAGE_LOGICAL_WIDTH, PAGE_LOGICAL_HEIGHT);
  drawPaperSurface(context, pageIndex ?? 0, dark);

  const innerShade = context.createLinearGradient(0, 0, PAGE_LOGICAL_WIDTH, 0);
  if (dark) {
    innerShade.addColorStop(0, 'rgba(0, 0, 0, 0.11)');
    innerShade.addColorStop(0.055, 'rgba(0, 0, 0, 0.025)');
    innerShade.addColorStop(0.92, 'rgba(255, 255, 255, 0.006)');
    innerShade.addColorStop(1, 'rgba(0, 0, 0, 0.055)');
  } else {
    innerShade.addColorStop(0, 'rgba(68, 48, 31, 0.060)');
    innerShade.addColorStop(0.055, 'rgba(68, 48, 31, 0.012)');
    innerShade.addColorStop(0.92, 'rgba(68, 48, 31, 0.004)');
    innerShade.addColorStop(1, 'rgba(68, 48, 31, 0.030)');
  }
  context.fillStyle = innerShade;
  context.fillRect(0, 0, PAGE_LOGICAL_WIDTH, PAGE_LOGICAL_HEIGHT);

  if (page) {
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.fillStyle = inkTone;

    for (const line of page.lines) {
      context.font = `${line.fontWeight} ${line.fontSize}px ${settings.fontFamily}`;
      context.globalAlpha = line.kind === 'heading' ? (dark ? 0.96 : 0.91) : (dark ? 0.90 : 0.82);
      context.fillText(line.text, line.x, line.baselineY);
    }
  }

  if (typeof pageIndex === 'number') {
    const pageNumber = pageIndex + 1;
    const isLeftPage = pageIndex % 2 === 0;
    const numberScale = THREE.MathUtils.clamp(settings.pageNumberScale ?? 1, 0.65, 2.25);
    const fontSize = 16 * numberScale;
    const edgeInset = Math.max(34, settings.marginX * 0.58, fontSize * 1.7);
    const bottomInset = Math.max(34, fontSize * 1.8);

    context.globalAlpha = dark ? 0.56 : 0.43;
    context.fillStyle = inkTone;
    context.textAlign = isLeftPage ? 'left' : 'right';
    context.textBaseline = 'alphabetic';
    context.font = `400 ${fontSize}px ${settings.fontFamily}`;
    context.fillText(
      String(pageNumber),
      isLeftPage ? edgeInset : PAGE_LOGICAL_WIDTH - edgeInset,
      PAGE_LOGICAL_HEIGHT - bottomInset
    );
  }

  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = THREE.MathUtils.clamp(Math.floor(options.anisotropy ?? 16), 1, 16);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function drawPaperSurface(context: CanvasRenderingContext2D, pageIndex: number, dark: boolean): void {
  let seed = (pageIndex + 1) * 2654435761 >>> 0;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  context.save();
  context.lineCap = 'round';

  for (let index = 0; index < 190; index += 1) {
    const x = random() * PAGE_LOGICAL_WIDTH;
    const y = random() * PAGE_LOGICAL_HEIGHT;
    const length = 3 + random() * 15;
    const tilt = (random() - 0.5) * 0.22;
    const alpha = (dark ? 0.010 : 0.012) + random() * (dark ? 0.018 : 0.016);
    context.strokeStyle = dark
      ? `rgba(255,255,255,${alpha.toFixed(4)})`
      : `rgba(80,68,55,${alpha.toFixed(4)})`;
    context.lineWidth = 0.32 + random() * 0.42;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + length, y + length * tilt);
    context.stroke();
  }

  for (let index = 0; index < 80; index += 1) {
    const alpha = (dark ? 0.010 : 0.009) + random() * 0.014;
    context.fillStyle = dark
      ? `rgba(255,255,255,${alpha.toFixed(4)})`
      : `rgba(58,48,39,${alpha.toFixed(4)})`;
    const radius = 0.28 + random() * 0.62;
    context.beginPath();
    context.arc(random() * PAGE_LOGICAL_WIDTH, random() * PAGE_LOGICAL_HEIGHT, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}
