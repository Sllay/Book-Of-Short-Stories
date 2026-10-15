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

  // Lighter honey-oak boards make the floor immediately distinct from both the dark
  // desk and the plaster wall, even under the warm night palette.
  context.fillStyle = '#b68b5f';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const random = createRandom(0x334abf12);
  const boardHeight = 72;

  for (let board = 0; board < 8; board += 1) {
    const y = board * boardHeight;
    const warmth = (random() - 0.5) * 14;
    context.fillStyle = `rgba(${190 + warmth},${147 + warmth * 0.55},${99 + warmth * 0.32},0.22)`;
    context.fillRect(0, y, canvas.width, boardHeight);

    context.fillStyle = 'rgba(60,39,24,.34)';
    context.fillRect(0, y, canvas.width, 2.4);
    context.fillStyle = 'rgba(255,227,185,.08)';
    context.fillRect(0, y + 2.4, canvas.width, 1.1);

    const jointOffset = board % 2 === 0 ? 118 : 320;
    for (let joint = jointOffset; joint < canvas.width; joint += 250 + Math.floor(random() * 70)) {
      context.fillStyle = 'rgba(64,42,26,.22)';
      context.fillRect(joint, y + 2, 1.4, boardHeight - 3);
    }
  }

  for (let index = 0; index < 190; index += 1) {
    const y = random() * canvas.height;
    const x = random() * canvas.width;
    const length = 45 + random() * 150;
    const bend = (random() - 0.5) * 5;
    context.strokeStyle = random() > 0.22
      ? `rgba(75,47,27,${(0.018 + random() * 0.038).toFixed(3)})`
      : `rgba(255,225,183,${(0.012 + random() * 0.024).toFixed(3)})`;
    context.lineWidth = 0.45 + random() * 1.05;
    context.beginPath();
    context.moveTo(x, y);
    context.bezierCurveTo(x + length * 0.33, y + bend, x + length * 0.68, y - bend, x + length, y);
    context.stroke();
  }

  for (let index = 0; index < 16; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    context.strokeStyle = 'rgba(74,45,27,.12)';
    context.lineWidth = 0.9;
    context.beginPath();
    context.ellipse(x, y, 6 + random() * 14, 2 + random() * 4, (random() - 0.5) * 0.18, 0, Math.PI * 2);
    context.stroke();
  }

  return finishTexture(canvas, 2.65, 2.25);
}

export function createWallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required to create the wall material.');

  // Fine plaster: neutral, low-directionality and deliberately unlike wood grain.
  context.fillStyle = '#8c756b';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const random = createRandom(0x47c21dd9);

  for (let index = 0; index < 1800; index += 1) {
    const bright = random() > 0.5;
    const alpha = 0.008 + random() * 0.02;
    context.fillStyle = bright
      ? `rgba(247,238,226,${alpha.toFixed(4)})`
      : `rgba(68,53,49,${(alpha * 0.72).toFixed(4)})`;
    const size = 0.35 + random() * 1.15;
    context.fillRect(random() * canvas.width, random() * canvas.height, size, size);
  }

  for (let index = 0; index < 34; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const radius = 5 + random() * 22;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255,246,234,${(0.006 + random() * 0.012).toFixed(4)})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  return finishTexture(canvas, 2.3, 2.3);
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