import * as THREE from 'three';

export class ClockRig {
  public readonly root = new THREE.Group();

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly texture: THREE.CanvasTexture;
  private readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private lastSecond = -1;

  public constructor() {
    this.canvas.width = 256;
    this.canvas.height = 256;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D indisponível para o relógio.');
    this.context = context;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    // The old clock lived above the camera crop and its face was almost edge-on.
    // Keep it beside the round mirror, tilted with the same tabletop composition.
    this.root.position.set(1.26, 2.28, 0.42);
    this.root.rotation.x = Math.PI / 2 - 0.12;
    this.root.rotation.z = 0.025;

    const faceMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.texture,
      roughness: 0.78,
      metalness: 0,
      side: THREE.DoubleSide
    }));
    const face = new THREE.Mesh(this.trackGeometry(new THREE.CircleGeometry(0.4, 48)), faceMaterial);
    face.position.z = 0.03;
    this.root.add(face);

    const frameMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x3d2c24,
      roughness: 0.64,
      metalness: 0.09,
      emissive: 0x160f0b,
      emissiveIntensity: 0.035
    }));
    const ring = new THREE.Mesh(this.trackGeometry(new THREE.RingGeometry(0.4, 0.48, 48)), frameMaterial);
    ring.position.z = 0.018;
    this.root.add(ring);

    const back = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.48, 0.48, 0.075, 48)), frameMaterial);
    back.rotation.x = Math.PI / 2;
    back.position.z = -0.018;
    this.root.add(back);

    const glassMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.055,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide
    }));
    const glass = new THREE.Mesh(this.trackGeometry(new THREE.CircleGeometry(0.385, 40)), glassMaterial);
    glass.position.z = 0.041;
    this.root.add(glass);

    this.update(new Date(), true);
  }

  public update(date: Date, force = false): void {
    const second = date.getSeconds();
    if (!force && second === this.lastSecond) return;
    this.lastSecond = second;
    this.drawFace(date);
  }

  public dispose(): void {
    this.texture.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  private drawFace(date: Date): void {
    const context = this.context;
    const size = this.canvas.width;
    const center = size / 2;

    context.clearRect(0, 0, size, size);
    const faceGradient = context.createRadialGradient(center - 30, center - 38, 8, center, center, center);
    faceGradient.addColorStop(0, '#fbf5e7');
    faceGradient.addColorStop(0.68, '#e7dcc7');
    faceGradient.addColorStop(1, '#cbbca3');
    context.fillStyle = faceGradient;
    context.beginPath();
    context.arc(center, center, 124, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = 'rgba(56,43,34,.72)';
    context.fillStyle = 'rgba(56,43,34,.82)';
    context.lineCap = 'round';
    for (let mark = 0; mark < 60; mark += 1) {
      const angle = mark / 60 * Math.PI * 2 - Math.PI / 2;
      const major = mark % 5 === 0;
      const inner = major ? 91 : 101;
      const outer = 111;
      context.lineWidth = major ? 3.4 : 1.05;
      context.beginPath();
      context.moveTo(center + Math.cos(angle) * inner, center + Math.sin(angle) * inner);
      context.lineTo(center + Math.cos(angle) * outer, center + Math.sin(angle) * outer);
      context.stroke();
    }

    // Four numerals make it immediately read as a real clock from the reader camera,
    // while keeping the prop discreet beside the mirror.
    context.font = '600 19px Georgia, serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = 'rgba(55,42,33,.82)';
    context.fillText('12', center, 38);
    context.fillText('3', 218, center + 1);
    context.fillText('6', center, 218);
    context.fillText('9', 38, center + 1);

    const hour = (date.getHours() % 12) + date.getMinutes() / 60;
    const minute = date.getMinutes() + date.getSeconds() / 60;
    const second = date.getSeconds();
    this.drawHand(hour / 12 * Math.PI * 2 - Math.PI / 2, 54, 6.4, '#352820');
    this.drawHand(minute / 60 * Math.PI * 2 - Math.PI / 2, 78, 4.2, '#352820');
    this.drawHand(second / 60 * Math.PI * 2 - Math.PI / 2, 84, 1.8, '#a04e38');

    context.fillStyle = '#34271f';
    context.beginPath();
    context.arc(center, center, 6.2, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#c67b52';
    context.beginPath();
    context.arc(center, center, 2.4, 0, Math.PI * 2);
    context.fill();

    this.texture.needsUpdate = true;
  }

  private drawHand(angle: number, length: number, width: number, color: string): void {
    const context = this.context;
    const center = this.canvas.width / 2;
    context.strokeStyle = color;
    context.lineWidth = width;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(center - Math.cos(angle) * 8, center - Math.sin(angle) * 8);
    context.lineTo(center + Math.cos(angle) * length, center + Math.sin(angle) * length);
    context.stroke();
  }

  private trackGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  private trackMaterial<T extends THREE.Material>(material: T): T {
    this.materials.push(material);
    return material;
  }
}