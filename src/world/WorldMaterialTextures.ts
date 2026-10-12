import * as THREE from 'three';

export function createWoodTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required to create the desk material.');

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#6b452e');
  gradient.addColorStop(0.52, '#5b3927');
  gradient.addColorStop(1, '#4d3022');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  let seed = 0x97d3a51b;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  const plankWidth = 128;
  for (let x = plankWidth; x < canvas.width; x += plankWidth) {
    context.fillStyle = 'rgba(33,20,13,.18)';
    context.fillRect(x - 1.2, 0, 2.4, canvas.height);
    context.fillStyle = 'rgba(255,220,174,.025)';
    context.fillRect(x + 1.5, 0, 0.8, canvas.height);
  }

  context.lineCap = 'round';
  for (let index = 0; index < 150; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const length = 36 + random() * 150;
    const bend = (random() - 0.5) * 10;
    const alpha = 0.018 + random() * 0.042;
    context.strokeStyle = random() > 0.35
      ? `rgba(35,21,14,${alpha.toFixed(4)})`
      : `rgba(238,188,128,${(alpha * 0.55).toFixed(4)})`;
    context.lineWidth = 0.55 + random() * 1.15;
    context.beginPath();
    context.moveTo(x, y);
    context.bezierCurveTo(x + length * 0.32, y + bend, x + length * 0.68, y - bend, x + length, y + bend * 0.25);
    context.stroke();
  }

  for (let index = 0; index < 8; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const radiusX = 7 + random() * 11;
    const radiusY = 2.5 + random() * 4.5;
    context.strokeStyle = 'rgba(39,23,14,.13)';
    context.lineWidth = 1.2;
    context.beginPath();
    context.ellipse(x, y, radiusX, radiusY, random() * 0.35, 0, Math.PI * 2);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.5, 1.8);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function createWaxTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required to create the candle material.');

  context.fillStyle = '#f2dfbc';
  context.fillRect(0, 0, canvas.width, canvas.height);

  let seed = 0xa21f9c43;
  const random = (): number => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed / 0x100000000;
  };

  for (let index = 0; index < 110; index += 1) {
    const x = random() * canvas.width;
    const width = 0.5 + random() * 1.5;
    const alpha = 0.012 + random() * 0.025;
    context.fillStyle = random() > 0.45
      ? `rgba(255,255,255,${alpha.toFixed(4)})`
      : `rgba(122,91,57,${(alpha * 0.65).toFixed(4)})`;
    context.fillRect(x, random() * 5, width, 118 + random() * 10);
  }

  for (let index = 0; index < 55; index += 1) {
    const alpha = 0.012 + random() * 0.02;
    context.fillStyle = `rgba(122,91,57,${alpha.toFixed(4)})`;
    context.beginPath();
    context.arc(random() * canvas.width, random() * canvas.height, 0.4 + random() * 1.2, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.4, 2.2);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
