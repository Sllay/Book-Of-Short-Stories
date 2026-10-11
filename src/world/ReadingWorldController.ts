import * as THREE from 'three';

interface WorldPalette {
  readonly skyTop: number;
  readonly skyBottom: number;
  readonly ambientSky: number;
  readonly ambientGround: number;
  readonly keyColor: number;
  readonly keyIntensity: number;
  readonly hemisphereIntensity: number;
  readonly candleIntensity: number;
  readonly wallColor: number;
}

interface PaletteStop extends WorldPalette {
  readonly hour: number;
}

const PALETTE_STOPS: readonly PaletteStop[] = [
  { hour: 0, skyTop: 0x07101f, skyBottom: 0x18233d, ambientSky: 0x8ba6cf, ambientGround: 0x29242d, keyColor: 0xa9c8ff, keyIntensity: 0.52, hemisphereIntensity: 0.72, candleIntensity: 0.96, wallColor: 0x251f22 },
  { hour: 5.5, skyTop: 0x28394e, skyBottom: 0xc8785d, ambientSky: 0xd7bdad, ambientGround: 0x49372f, keyColor: 0xffb77b, keyIntensity: 1.02, hemisphereIntensity: 1.0, candleIntensity: 0.72, wallColor: 0x48362f },
  { hour: 8, skyTop: 0x75afd5, skyBottom: 0xdedac7, ambientSky: 0xffefd2, ambientGround: 0x6c5742, keyColor: 0xffd8a5, keyIntensity: 1.72, hemisphereIntensity: 1.42, candleIntensity: 0.34, wallColor: 0x66503f },
  { hour: 16, skyTop: 0x78acd0, skyBottom: 0xe4d5bd, ambientSky: 0xffebce, ambientGround: 0x68523f, keyColor: 0xffd29b, keyIntensity: 1.62, hemisphereIntensity: 1.36, candleIntensity: 0.38, wallColor: 0x64503f },
  { hour: 18.5, skyTop: 0x40506b, skyBottom: 0xdb815e, ambientSky: 0xd0b5ac, ambientGround: 0x49362f, keyColor: 0xffaa71, keyIntensity: 1.0, hemisphereIntensity: 0.94, candleIntensity: 0.76, wallColor: 0x49362f },
  { hour: 20.5, skyTop: 0x0b1426, skyBottom: 0x26304a, ambientSky: 0x91abd1, ambientGround: 0x2d2730, keyColor: 0xb2ccff, keyIntensity: 0.58, hemisphereIntensity: 0.76, candleIntensity: 0.94, wallColor: 0x292228 },
  { hour: 24, skyTop: 0x07101f, skyBottom: 0x18233d, ambientSky: 0x8ba6cf, ambientGround: 0x29242d, keyColor: 0xa9c8ff, keyIntensity: 0.52, hemisphereIntensity: 0.72, candleIntensity: 0.96, wallColor: 0x251f22 }
];

export class ReadingWorldController {
  public readonly root = new THREE.Group();

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly deskMaterial: THREE.MeshStandardMaterial;
  private readonly wallMaterial: THREE.MeshStandardMaterial;
  private readonly mirrorMaterial: THREE.MeshBasicMaterial;
  private readonly mirrorCanvas = document.createElement('canvas');
  private readonly mirrorContext: CanvasRenderingContext2D;
  private readonly mirrorTexture: THREE.CanvasTexture;
  private readonly candleLight = new THREE.PointLight(0xffa85c, 0.7, 4.4, 2);
  private lastClockMinute = -1;
  private focusMode = false;

  public constructor(
    private readonly hemisphere: THREE.HemisphereLight,
    private readonly keyLight: THREE.DirectionalLight
  ) {
    this.mirrorCanvas.width = 512;
    this.mirrorCanvas.height = 256;
    const context = this.mirrorCanvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D indisponível para o reflexo do ambiente.');
    this.mirrorContext = context;
    this.mirrorTexture = new THREE.CanvasTexture(this.mirrorCanvas);
    this.mirrorTexture.colorSpace = THREE.SRGBColorSpace;
    this.mirrorTexture.minFilter = THREE.LinearFilter;
    this.mirrorTexture.magFilter = THREE.LinearFilter;

    this.deskMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x5b3a28,
      roughness: 0.92,
      metalness: 0
    }));
    const desk = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(10.4, 6.8, 0.24)), this.deskMaterial);
    desk.position.set(0, 0.45, -0.45);
    this.root.add(desk);

    this.wallMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x5a4438,
      roughness: 1,
      metalness: 0
    }));
    const wall = new THREE.Mesh(this.trackGeometry(new THREE.PlaneGeometry(11.5, 4.6)), this.wallMaterial);
    wall.rotation.x = Math.PI / 2;
    wall.position.set(0, 3.34, 1.58);
    this.root.add(wall);

    const baseboardMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x2f211a, roughness: 0.94 }));
    const baseboard = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(10.6, 0.12, 0.16)), baseboardMaterial);
    baseboard.position.set(0, 3.24, -0.15);
    this.root.add(baseboard);

    this.mirrorMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      map: this.mirrorTexture,
      transparent: true,
      opacity: 0.9,
      toneMapped: false
    }));
    this.root.add(this.createMirror());
    this.root.add(this.createCandle());
    this.root.add(this.candleLight);

    this.refreshClock(true);
  }

  public setFocusMode(enabled: boolean): void {
    if (this.focusMode === enabled) return;
    this.focusMode = enabled;
    this.mirrorMaterial.opacity = enabled ? 0.32 : 0.9;
    this.refreshClock(true);
  }

  public refreshClock(force = false): void {
    const now = new Date();
    const minuteKey = now.getHours() * 60 + now.getMinutes();
    if (!force && minuteKey === this.lastClockMinute) return;
    this.lastClockMinute = minuteKey;

    const palette = samplePalette(now);
    this.applyLighting(palette);
    this.drawWindowReflection(now, palette);
  }

  public dispose(): void {
    this.mirrorTexture.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  private createMirror(): THREE.Group {
    const mirror = new THREE.Group();
    mirror.position.set(2.45, 2.34, 0.72);
    mirror.rotation.x = Math.PI / 2;
    mirror.rotation.z = -0.045;

    const panel = new THREE.Mesh(this.trackGeometry(new THREE.PlaneGeometry(2.28, 1.22)), this.mirrorMaterial);
    panel.position.z = 0.025;
    mirror.add(panel);

    const frameMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x2d211b, roughness: 0.78 }));
    const horizontal = this.trackGeometry(new THREE.BoxGeometry(2.46, 0.09, 0.07));
    const vertical = this.trackGeometry(new THREE.BoxGeometry(0.09, 1.38, 0.07));

    const top = new THREE.Mesh(horizontal, frameMaterial);
    const bottom = new THREE.Mesh(horizontal, frameMaterial);
    const left = new THREE.Mesh(vertical, frameMaterial);
    const right = new THREE.Mesh(vertical, frameMaterial);
    top.position.y = 0.655;
    bottom.position.y = -0.655;
    left.position.x = -1.185;
    right.position.x = 1.185;
    mirror.add(top, bottom, left, right);
    return mirror;
  }

  private createCandle(): THREE.Group {
    const candle = new THREE.Group();
    candle.position.set(-3.12, 0.72, -0.12);

    const waxMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xe7cfaa,
      roughness: 0.96,
      metalness: 0
    }));
    const wax = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.2, 0.245, 0.38, 18)), waxMaterial);
    wax.rotation.x = Math.PI / 2;
    candle.add(wax);

    const puddle = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.31, 0.34, 0.035, 20)), waxMaterial);
    puddle.rotation.x = Math.PI / 2;
    puddle.position.z = -0.205;
    candle.add(puddle);

    const wickMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0x2b1b14 }));
    const wick = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.012, 0.014, 0.11, 8)), wickMaterial);
    wick.rotation.x = Math.PI / 2;
    wick.position.z = 0.235;
    candle.add(wick);

    const flameMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0xffc069, toneMapped: false }));
    const flame = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.075, 12, 10)), flameMaterial);
    flame.scale.set(0.72, 0.72, 1.55);
    flame.position.z = 0.34;
    candle.add(flame);

    this.candleLight.position.copy(candle.position).add(new THREE.Vector3(0, 0, 0.34));
    return candle;
  }

  private applyLighting(palette: WorldPalette): void {
    this.hemisphere.color.setHex(palette.ambientSky);
    this.hemisphere.groundColor.setHex(palette.ambientGround);
    this.hemisphere.intensity = palette.hemisphereIntensity * (this.focusMode ? 0.76 : 1);

    this.keyLight.color.setHex(palette.keyColor);
    this.keyLight.intensity = palette.keyIntensity * (this.focusMode ? 1.08 : 1);
    this.keyLight.position.set(3.8, -2.2, 6.4);

    this.candleLight.intensity = palette.candleIntensity * (this.focusMode ? 0.42 : 1);
    this.wallMaterial.color.setHex(palette.wallColor);
  }

  private drawWindowReflection(date: Date, palette: WorldPalette): void {
    const context = this.mirrorContext;
    const width = this.mirrorCanvas.width;
    const height = this.mirrorCanvas.height;
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, colorCss(palette.skyTop));
    gradient.addColorStop(1, colorCss(palette.skyBottom));
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    const hour = date.getHours() + date.getMinutes() / 60;
    const daylight = hour >= 6.2 && hour <= 18.5;
    context.globalAlpha = daylight ? 0.42 : 0.35;
    context.fillStyle = daylight ? '#ffe1a5' : '#d8e6ff';
    context.beginPath();
    context.arc(daylight ? width * 0.76 : width * 0.2, daylight ? height * 0.31 : height * 0.27, daylight ? 18 : 12, 0, Math.PI * 2);
    context.fill();

    const blockSeed = Math.floor(date.getTime() / 900_000);
    const cloudChance = pseudoRandom(blockSeed * 17 + 3);
    if (cloudChance > 0.48) {
      const cloudCount = cloudChance > 0.82 ? 2 : 1;
      for (let index = 0; index < cloudCount; index += 1) {
        const seed = blockSeed * 37 + index * 101;
        const x = width * (0.12 + pseudoRandom(seed + 1) * 0.7);
        const y = height * (0.22 + pseudoRandom(seed + 2) * 0.33);
        const scale = 0.72 + pseudoRandom(seed + 3) * 0.7;
        this.drawCloud(context, x, y, scale, daylight ? 0.12 : 0.07);
      }
    }

    // Window bars are part of the reflected view, not a literal window in front of the reader.
    context.globalAlpha = 0.2;
    context.fillStyle = '#16130f';
    context.fillRect(width * 0.492, 0, width * 0.016, height);
    context.fillRect(0, height * 0.49, width, height * 0.025);

    // Dark glass/reflection tint keeps this readable as a mirror-like surface.
    context.globalAlpha = 0.16;
    context.fillStyle = '#111315';
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 1;
    this.mirrorTexture.needsUpdate = true;
  }

  private drawCloud(context: CanvasRenderingContext2D, x: number, y: number, scale: number, alpha: number): void {
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.ellipse(x, y, 42 * scale, 14 * scale, 0, 0, Math.PI * 2);
    context.ellipse(x - 26 * scale, y + 3 * scale, 25 * scale, 11 * scale, 0, 0, Math.PI * 2);
    context.ellipse(x + 24 * scale, y + 2 * scale, 30 * scale, 12 * scale, 0, 0, Math.PI * 2);
    context.ellipse(x - 7 * scale, y - 9 * scale, 22 * scale, 18 * scale, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
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

function samplePalette(date: Date): WorldPalette {
  const hour = date.getHours() + date.getMinutes() / 60;
  let left = PALETTE_STOPS[0];
  let right = PALETTE_STOPS[PALETTE_STOPS.length - 1];

  for (let index = 0; index < PALETTE_STOPS.length - 1; index += 1) {
    const candidateLeft = PALETTE_STOPS[index];
    const candidateRight = PALETTE_STOPS[index + 1];
    if (hour >= candidateLeft.hour && hour <= candidateRight.hour) {
      left = candidateLeft;
      right = candidateRight;
      break;
    }
  }

  const span = Math.max(0.001, right.hour - left.hour);
  const t = THREE.MathUtils.smoothstep((hour - left.hour) / span, 0, 1);
  return {
    skyTop: lerpHex(left.skyTop, right.skyTop, t),
    skyBottom: lerpHex(left.skyBottom, right.skyBottom, t),
    ambientSky: lerpHex(left.ambientSky, right.ambientSky, t),
    ambientGround: lerpHex(left.ambientGround, right.ambientGround, t),
    keyColor: lerpHex(left.keyColor, right.keyColor, t),
    keyIntensity: THREE.MathUtils.lerp(left.keyIntensity, right.keyIntensity, t),
    hemisphereIntensity: THREE.MathUtils.lerp(left.hemisphereIntensity, right.hemisphereIntensity, t),
    candleIntensity: THREE.MathUtils.lerp(left.candleIntensity, right.candleIntensity, t),
    wallColor: lerpHex(left.wallColor, right.wallColor, t)
  };
}

function lerpHex(from: number, to: number, t: number): number {
  const color = new THREE.Color(from).lerp(new THREE.Color(to), t);
  return color.getHex();
}

function colorCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}
