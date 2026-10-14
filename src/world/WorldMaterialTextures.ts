import * as THREE from 'three';

export function createWoodTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required to create the desk material.');

  context.fillStyle = '#5d3d2b';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const random = createRandom(0x97d3a51b);
  const plankWidth = 128;
  for (let plank = 0; plank < 4; plank += 1) {
    const x0 = plank * plankWidth;
    const warmth = (random() - 0.5) * 8;
    context.fillStyle = `rgba(${108 + warmth},${70 + warmth * 0.45},${47 + warmth * 0.25},0.16)`;
    context.fillRect(x0, 0, plankWidth, canvas.height);

    if (plank > 0) {
      context.fillStyle = 'rgba(31,19,12,.24)';
      context.fillRect(x0 - 1, 0, 2, canvas.height);
      context.fillStyle = 'rgba(255,226,184,.028)';
      context.fillRect(x0 + 1.4, 0, 0.8, canvas.height);
    }
  }

  context.lineCap = 'round';
  for (let index = 0; index < 185; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const length = 42 + random() * 160;
    const bend = (random() - 0.5) * 9;
    const alpha = 0.018 + random() * 0.038;
    context.strokeStyle = random() > 0.3
      ? `rgba(33,20,13,${alpha.toFixed(4)})`
      : `rgba(232,183,126,${(alpha * 0.48).toFixed(4)})`;
    context.lineWidth = 0.5 + random() * 1.15;
    context.beginPath();
    context.moveTo(x, y);
    context.bezierCurveTo(x + length * 0.3, y + bend, x + length * 0.7, y - bend, x + length, y + bend * 0.2);
    context.stroke();
  }

  for (let index = 0; index < 10; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    context.strokeStyle = 'rgba(34,20,13,.12)';
    context.lineWidth = 1;
    context.beginPath();
    context.ellipse(x, y, 8 + random() * 12, 2.8 + random() * 4, random() * 0.3, 0, Math.PI * 2);
    context.stroke();
  }

  return finishTexture(canvas, 2.35, 1.65);
}

export function createFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required to create the floor material.');

  context.fillStyle = '#765d47';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const random = createRandom(0x334abf12);
  const boardHeight = 86;

  for (let board = 0; board < 7; board += 1) {
    const y = board * boardHeight;
    const value = 0.025 + random() * 0.035;
    context.fillStyle = board % 2 === 0
      ? `rgba(255,232,199,${value.toFixed(3)})`
      : `rgba(43,30,21,${(value * 0.75).toFixed(3)})`;
    context.fillRect(0, y, canvas.width, boardHeight);
    context.fillStyle = 'rgba(38,27,20,.22)';
    context.fillRect(0, y, canvas.width, 2);
  }

  for (let index = 0; index < 150; index += 1) {
    const y = random() * canvas.height;
    const x = random() * canvas.width;
    const length = 55 + random() * 165;
    context.strokeStyle = `rgba(48,32,21,${(0.018 + random() * 0.035).toFixed(3)})`;
    context.lineWidth = 0.5 + random() * 1.05;
    context.beginPath();
    context.moveTo(x, y);
    context.bezierCurveTo(x + length * 0.35, y + (random() - 0.5) * 7, x + length * 0.7, y + (random() - 0.5) * 7, x + length, y);
    context.stroke();
  }

  return finishTexture(canvas, 2.2, 2.1);
}

export function createWallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required to create the wall material.');

  context.fillStyle = '#8a7060';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const random = createRandom(0x47c21dd9);

  for (let index = 0; index < 1300; index += 1) {
    const value = random();
    const alpha = 0.009 + random() * 0.018;
    context.fillStyle = value > 0.48
      ? `rgba(255,245,229,${alpha.toFixed(4)})`
      : `rgba(63,45,37,${(alpha * 0.8).toFixed(4)})`;
    const size = 0.4 + random() * 1.4;
    context.fillRect(random() * canvas.width, random() * canvas.height, size, size);
  }

  for (let index = 0; index < 22; index += 1) {
    const y = random() * canvas.height;
    context.strokeStyle = `rgba(71,52,43,${(0.008 + random() * 0.012).toFixed(4)})`;
    context.lineWidth = 0.5;
    context.beginPath();
    context.moveTo(0, y);
    context.bezierCurveTo(70, y + (random() - 0.5) * 5, 180, y + (random() - 0.5) * 5, canvas.width, y);
    context.stroke();
  }

  return finishTexture(canvas, 2, 2);
}

export function createWaxTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required to create the candle material.');

  context.fillStyle = '#f2dfbc';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const random = createRandom(0xa21f9c43);

  for (let index = 0; index < 120; index += 1) {
    const x = random() * canvas.width;
    const width = 0.45 + random() * 1.35;
    const alpha = 0.01 + random() * 0.022;
    context.fillStyle = random() > 0.45
      ? `rgba(255,255,255,${alpha.toFixed(4)})`
      : `rgba(122,91,57,${(alpha * 0.62).toFixed(4)})`;
    context.fillRect(x, random() * 5, width, 118 + random() * 10);
  }

  for (let index = 0; index < 55; index += 1) {
    const alpha = 0.01 + random() * 0.018;
    context.fillStyle = `rgba(122,91,57,${alpha.toFixed(4)})`;
    context.beginPath();
    context.arc(random() * canvas.width, random() * canvas.height, 0.4 + random() * 1.2, 0, Math.PI * 2);
    context.fill();
  }

  return finishTexture(canvas, 1.4, 2.2);
}

function createRandom(initialSeed: number): () => number {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function finishTexture(canvas: HTMLCanvasElement, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
