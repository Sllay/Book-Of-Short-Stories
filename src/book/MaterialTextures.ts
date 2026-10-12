import * as THREE from 'three';

export function createPageStackTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required to create the page stack texture.');

  context.fillStyle = '#f8f6f1';
  context.fillRect(0, 0, canvas.width, canvas.height);

  let seed = 0x514e3a21;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  for (let y = 2; y < canvas.height; y += 3) {
    const alpha = 0.055 + random() * 0.045;
    context.strokeStyle = `rgba(66,58,49,${alpha.toFixed(4)})`;
    context.lineWidth = random() > 0.86 ? 0.8 : 0.42;
    context.beginPath();
    context.moveTo(0, y + (random() - 0.5) * 0.55);
    for (let x = 0; x <= canvas.width; x += 18) {
      context.lineTo(x, y + (random() - 0.5) * 0.75);
    }
    context.stroke();
  }

  for (let index = 0; index < 90; index += 1) {
    context.fillStyle = `rgba(70,60,50,${(0.012 + random() * 0.018).toFixed(4)})`;
    context.fillRect(random() * canvas.width, random() * canvas.height, 1 + random() * 2, 0.5 + random());
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
