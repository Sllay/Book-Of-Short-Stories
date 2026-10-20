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
    this.canvas.width = 512;
    this.canvas.height = 220;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D indisponível para o relógio.');
    this.context = context;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    // A compact bedside-style digital clock is much easier to read from the reader
    // camera than the old foreshortened analog face. Keep it beside the mirror but
    // almost front-facing so the time stays legible at every supported zoom level.
    this.root.position.set(1.24, 2.26, 0.43);
    this.root.rotation.x = 0.12;
    this.root.rotation.z = 0.018;

    const bodyMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x211d1a,
      roughness: 0.72,
      metalness: 0.08,
      emissive: 0x090807,
      emissiveIntensity: 0.05
    }));
    const body = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(1.28, 0.62, 0.2)), bodyMaterial);
    this.root.add(body);

    const bezelMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x332c27,
      roughness: 0.64,
      metalness: 0.05,
      emissive: 0x0d0b09,
      emissiveIntensity: 0.035
    }));
    const bezel = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(1.11, 0.43, 0.035)), bezelMaterial);
    bezel.position.z = 0.116;
    this.root.add(bezel);

    const screenMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: this.texture,
      toneMapped: false,
      side: THREE.DoubleSide
    }));
    const screen = new THREE.Mesh(this.trackGeometry(new THREE.PlaneGeometry(1.02, 0.34)), screenMaterial);
    screen.position.z = 0.137;
    this.root.add(screen);

    const glassMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      color: 0xfff1da,
      transparent: true,
      opacity: 0.035,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide
    }));
    const glass = new THREE.Mesh(this.trackGeometry(new THREE.PlaneGeometry(1.015, 0.335)), glassMaterial);
    glass.position.z = 0.143;
    this.root.add(glass);

    const footGeometry = this.trackGeometry(new THREE.BoxGeometry(0.24, 0.08, 0.16));
    for (const x of [-0.43, 0.43]) {
      const foot = new THREE.Mesh(footGeometry, bodyMaterial);
      foot.position.set(x, -0.34, -0.025);
      this.root.add(foot);
    }

    this.update(new Date(), true);
  }

  public update(date: Date, force = false): void {
    const second = date.getSeconds();
    if (!force && second === this.lastSecond) return;
    this.lastSecond = second;
    this.drawDisplay(date);
  }

  public dispose(): void {
    this.texture.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  private drawDisplay(date: Date): void {
    const context = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;

    context.clearRect(0, 0, width, height);

    const background = context.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, '#080908');
    background.addColorStop(0.56, '#10120f');
    background.addColorStop(1, '#060706');
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    context.fillStyle = 'rgba(255, 203, 112, 0.05)';
    for (let line = 0; line < 7; line += 1) {
      context.fillRect(20, 25 + line * 26, width - 40, 1);
    }

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const colon = date.getSeconds() % 2 === 0 ? ':' : ' ';
    const time = `${hours}${colon}${minutes}`;

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = 'rgba(255, 150, 56, 0.72)';
    context.shadowBlur = 22;
    context.fillStyle = '#ffb257';
    context.font = '700 142px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    context.fillText(time, width * 0.5, height * 0.52, width - 44);

    context.shadowBlur = 0;
    context.fillStyle = 'rgba(255, 207, 145, 0.54)';
    context.font = '600 20px ui-sans-serif, system-ui, sans-serif';
    context.letterSpacing = '3px';
    context.fillText('LOCAL', width * 0.5, height - 18);

    this.texture.needsUpdate = true;
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
