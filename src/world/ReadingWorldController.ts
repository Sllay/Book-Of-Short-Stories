import * as THREE from 'three';
import { createWaxTexture, createWoodTexture } from './WorldMaterialTextures';

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
  private readonly textures: THREE.Texture[] = [];
  private readonly deskMaterial: THREE.MeshStandardMaterial;
  private readonly wallMaterial: THREE.MeshStandardMaterial;
  private readonly mirrorMaterial: THREE.MeshBasicMaterial;
  private readonly reflectionCanvas = document.createElement('canvas');
  private readonly reflectionContext: CanvasRenderingContext2D;
  private readonly reflectionTexture: THREE.CanvasTexture;
  private readonly candleLight = new THREE.PointLight(0xffa85c, 0.7, 4.6, 2);
  private readonly flame: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly flameGlow: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private baseCandleIntensity = 0.7;
  private ambientSeconds = 0;
  private lastClockMinute = -1;
  private lastReflectionTick = -1;
  private focusMode = false;

  public constructor(
    private readonly hemisphere: THREE.HemisphereLight,
    private readonly keyLight: THREE.DirectionalLight
  ) {
    this.reflectionCanvas.width = 512;
    this.reflectionCanvas.height = 512;
    const context = this.reflectionCanvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D indisponível para o reflexo do ambiente.');
    this.reflectionContext = context;
    this.reflectionTexture = new THREE.CanvasTexture(this.reflectionCanvas);
    this.reflectionTexture.colorSpace = THREE.SRGBColorSpace;
    this.reflectionTexture.minFilter = THREE.LinearFilter;
    this.reflectionTexture.magFilter = THREE.LinearFilter;
    this.reflectionTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.reflectionTexture.wrapT = THREE.ClampToEdgeWrapping;

    const woodTexture = this.trackTexture(createWoodTexture());
    this.deskMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: woodTexture,
      roughness: 0.9,
      metalness: 0
    }));
    const desk = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(10.6, 7.25, 0.28)), this.deskMaterial);
    desk.position.set(0, 0.42, -0.47);
    this.root.add(desk);

    const deskLipMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x7b543b,
      map: woodTexture,
      roughness: 0.91,
      metalness: 0
    }));
    const deskLip = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(10.7, 0.16, 0.19)), deskLipMaterial);
    deskLip.position.set(0, -3.15, -0.36);
    this.root.add(deskLip);

    this.wallMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x5a4438,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide
    }));
    this.root.add(this.createWallCorner());

    this.mirrorMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      map: this.reflectionTexture,
      transparent: true,
      opacity: 0.88,
      toneMapped: false,
      side: THREE.DoubleSide
    }));
    this.root.add(this.createMirror());

    const candle = this.createCandle();
    this.flame = candle.flame;
    this.flameGlow = candle.glow;
    this.root.add(candle.root);
    this.root.add(this.candleLight);

    this.refreshClock(true);
  }

  public setFocusMode(enabled: boolean): void {
    if (this.focusMode === enabled) return;
    this.focusMode = enabled;
    this.mirrorMaterial.opacity = enabled ? 0.26 : 0.88;
    this.refreshClock(true);
  }

  public update(deltaMs: number): void {
    const safeDelta = Math.max(0, Math.min(100, deltaMs));
    this.ambientSeconds += safeDelta / 1000;

    const flicker = 1
      + Math.sin(this.ambientSeconds * 7.7) * 0.028
      + Math.sin(this.ambientSeconds * 13.1 + 0.8) * 0.013
      + Math.sin(this.ambientSeconds * 3.2 + 2.1) * 0.009;
    const focusFactor = this.focusMode ? 0.48 : 1;
    this.candleLight.intensity = this.baseCandleIntensity * flicker * focusFactor;

    const flamePulse = THREE.MathUtils.clamp(flicker, 0.95, 1.06);
    this.flame.scale.set(0.66 * flamePulse, 0.66 * flamePulse, 1.48 / flamePulse);
    this.flame.position.x = Math.sin(this.ambientSeconds * 5.8) * 0.008;
    this.flame.position.y = Math.sin(this.ambientSeconds * 4.1 + 1.2) * 0.006;
    this.flameGlow.scale.setScalar(1 + Math.sin(this.ambientSeconds * 4.8) * 0.025);

    const reflectionTick = Math.floor(Date.now() / 3000);
    if (reflectionTick !== this.lastReflectionTick) {
      this.lastReflectionTick = reflectionTick;
      this.refreshClock(true);
    }
  }

  public refreshClock(force = false): void {
    const now = new Date();
    const minuteKey = now.getHours() * 60 + now.getMinutes();
    if (!force && minuteKey === this.lastClockMinute) return;
    this.lastClockMinute = minuteKey;

    const palette = samplePalette(now);
    this.applyLighting(palette);
    this.drawMirrorReflection(now, palette);
  }

  public dispose(): void {
    this.reflectionTexture.dispose();
    for (const texture of this.textures) texture.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  private createWallCorner(): THREE.Group {
    const group = new THREE.Group();

    const rearWall = new THREE.Mesh(
      this.trackGeometry(new THREE.BoxGeometry(5.2, 0.18, 4.45)),
      this.wallMaterial
    );
    rearWall.position.set(1.96, 3.72, 1.45);
    group.add(rearWall);

    const rightWall = new THREE.Mesh(
      this.trackGeometry(new THREE.BoxGeometry(0.18, 6.7, 4.45)),
      this.wallMaterial
    );
    rightWall.position.set(4.52, 0.47, 1.45);
    group.add(rightWall);

    const cornerTrimMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x32251f,
      roughness: 0.94,
      metalness: 0
    }));
    const rearTrim = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(5.25, 0.1, 0.13)), cornerTrimMaterial);
    rearTrim.position.set(1.94, 3.61, -0.23);
    group.add(rearTrim);

    const rightTrim = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.11, 6.68, 0.13)), cornerTrimMaterial);
    rightTrim.position.set(4.4, 0.48, -0.23);
    group.add(rightTrim);

    return group;
  }

  private createMirror(): THREE.Group {
    const mirror = new THREE.Group();
    mirror.position.set(2.62, 2.24, 0.48);
    mirror.rotation.x = Math.PI / 2 - 0.11;
    mirror.rotation.z = -0.035;

    const panel = new THREE.Mesh(this.trackGeometry(new THREE.CircleGeometry(0.76, 52)), this.mirrorMaterial);
    panel.position.z = 0.035;
    mirror.add(panel);

    const frameMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x382920,
      roughness: 0.58,
      metalness: 0.1
    }));
    const frame = new THREE.Mesh(this.trackGeometry(new THREE.RingGeometry(0.76, 0.88, 52)), frameMaterial);
    frame.position.z = 0.018;
    mirror.add(frame);

    const back = new THREE.Mesh(
      this.trackGeometry(new THREE.CylinderGeometry(0.88, 0.88, 0.055, 52)),
      frameMaterial
    );
    back.rotation.x = Math.PI / 2;
    back.position.z = -0.01;
    mirror.add(back);

    const standMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0x2d211b,
      roughness: 0.7,
      metalness: 0.07
    }));
    const stem = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.11, 0.34, 0.075)), standMaterial);
    stem.position.set(0, -0.89, -0.02);
    mirror.add(stem);

    const foot = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.88, 0.14, 0.12)), standMaterial);
    foot.position.set(0, -1.06, 0.055);
    mirror.add(foot);

    return mirror;
  }

  private createCandle(): {
    readonly root: THREE.Group;
    readonly flame: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
    readonly glow: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  } {
    const root = new THREE.Group();
    root.position.set(-3.08, 0.92, -0.31);

    const waxTexture = this.trackTexture(createWaxTexture());
    const waxMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 0xf1ddb8,
      map: waxTexture,
      roughness: 0.97,
      metalness: 0
    }));

    const wax = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.18, 0.22, 0.46, 24)), waxMaterial);
    wax.rotation.x = Math.PI / 2;
    wax.position.z = 0.27;
    root.add(wax);

    const meltedTop = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.17, 18, 10)), waxMaterial);
    meltedTop.scale.set(1.0, 0.94, 0.17);
    meltedTop.position.set(-0.01, 0.015, 0.50);
    root.add(meltedTop);

    const puddle = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.27, 0.30, 0.026, 26)), waxMaterial);
    puddle.rotation.x = Math.PI / 2;
    puddle.position.set(0.015, -0.01, 0.025);
    root.add(puddle);

    const dripA = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.052, 12, 8)), waxMaterial);
    dripA.scale.set(0.72, 0.52, 1.65);
    dripA.position.set(0.15, -0.055, 0.37);
    root.add(dripA);

    const dripB = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.044, 10, 8)), waxMaterial);
    dripB.scale.set(0.68, 0.48, 1.35);
    dripB.position.set(-0.135, 0.075, 0.33);
    root.add(dripB);

    const dripC = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.034, 10, 8)), waxMaterial);
    dripC.scale.set(0.66, 0.5, 1.1);
    dripC.position.set(0.035, 0.17, 0.405);
    root.add(dripC);

    const wickMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0x241711 }));
    const wick = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.01, 0.012, 0.085, 8)), wickMaterial);
    wick.rotation.x = Math.PI / 2;
    wick.position.z = 0.565;
    root.add(wick);

    const flameMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      color: 0xffbf62,
      toneMapped: false
    }));
    const flame = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.07, 14, 12)), flameMaterial);
    flame.scale.set(0.66, 0.66, 1.48);
    flame.position.z = 0.67;
    root.add(flame);

    const glowMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      color: 0xff9c4a,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
      toneMapped: false
    }));
    const glow = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.17, 12, 10)), glowMaterial);
    glow.scale.set(1, 1, 1.2);
    glow.position.z = 0.665;
    root.add(glow);

    this.candleLight.position.copy(root.position).add(new THREE.Vector3(0, 0, 0.65));
    return { root, flame, glow };
  }

  private applyLighting(palette: WorldPalette): void {
    this.hemisphere.color.setHex(palette.ambientSky);
    this.hemisphere.groundColor.setHex(palette.ambientGround);
    this.hemisphere.intensity = palette.hemisphereIntensity * (this.focusMode ? 0.76 : 1);

    this.keyLight.color.setHex(palette.keyColor);
    this.keyLight.intensity = palette.keyIntensity * (this.focusMode ? 1.08 : 1);
    this.keyLight.position.set(4.2, -2.0, 6.4);

    this.baseCandleIntensity = palette.candleIntensity;
    this.candleLight.intensity = this.baseCandleIntensity * (this.focusMode ? 0.48 : 1);
    this.wallMaterial.color.setHex(palette.wallColor);
  }

  private drawMirrorReflection(date: Date, palette: WorldPalette): void {
    const context = this.reflectionContext;
    const width = this.reflectionCanvas.width;
    const height = this.reflectionCanvas.height;

    const wallTop = colorCss(lerpHex(palette.wallColor, 0x9b806e, 0.12));
    const wallBottom = colorCss(lerpHex(palette.wallColor, 0x17120f, 0.22));
    const wallGradient = context.createLinearGradient(0, 0, 0, height);
    wallGradient.addColorStop(0, wallTop);
    wallGradient.addColorStop(1, wallBottom);
    context.globalAlpha = 1;
    context.fillStyle = wallGradient;
    context.fillRect(0, 0, width, height);

    const wx = 82;
    const wy = 78;
    const ww = 348;
    const wh = 302;
    const frame = 16;

    context.fillStyle = 'rgba(35,27,22,.92)';
    context.fillRect(wx - frame, wy - frame, ww + frame * 2, wh + frame * 2);

    const gx = wx;
    const gy = wy;
    const gw = ww;
    const gh = wh;
    const skyGradient = context.createLinearGradient(0, gy, 0, gy + gh);
    skyGradient.addColorStop(0, colorCss(palette.skyTop));
    skyGradient.addColorStop(1, colorCss(palette.skyBottom));
    context.fillStyle = skyGradient;
    context.fillRect(gx, gy, gw, gh);

    context.save();
    context.beginPath();
    context.rect(gx, gy, gw, gh);
    context.clip();

    const hour = date.getHours() + date.getMinutes() / 60;
    const daylight = hour >= 6.2 && hour <= 18.5;
    context.globalAlpha = daylight ? 0.38 : 0.28;
    context.fillStyle = daylight ? '#ffe0a2' : '#d9e7ff';
    context.beginPath();
    context.arc(
      daylight ? gx + gw * 0.72 : gx + gw * 0.26,
      daylight ? gy + gh * 0.28 : gy + gh * 0.25,
      daylight ? 22 : 14,
      0,
      Math.PI * 2
    );
    context.fill();

    const blockSeed = Math.floor(date.getTime() / 900_000);
    const cloudChance = pseudoRandom(blockSeed * 17 + 3);
    if (cloudChance > 0.57) {
      const cloudCount = cloudChance > 0.86 ? 2 : 1;
      const drift = (date.getTime() / 1000 % 120) / 120;
      for (let index = 0; index < cloudCount; index += 1) {
        const seed = blockSeed * 37 + index * 101;
        const start = -0.12 + pseudoRandom(seed + 1) * 0.38;
        const x = gx + gw * (start + drift * 0.82 + index * 0.17);
        const y = gy + gh * (0.25 + pseudoRandom(seed + 2) * 0.26);
        const scale = 0.7 + pseudoRandom(seed + 3) * 0.48;
        this.drawCloud(context, x, y, scale, daylight ? 0.095 : 0.052);
      }
    }

    context.restore();

    context.globalAlpha = 0.28;
    context.fillStyle = '#17130f';
    context.fillRect(gx + gw * 0.49, gy, gw * 0.022, gh);
    context.fillRect(gx, gy + gh * 0.50, gw, gh * 0.026);

    context.globalAlpha = 0.10;
    const sheen = context.createLinearGradient(0, 0, width, height);
    sheen.addColorStop(0.1, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.43, 'rgba(255,255,255,.30)');
    sheen.addColorStop(0.56, 'rgba(255,255,255,.04)');
    sheen.addColorStop(0.8, 'rgba(255,255,255,0)');
    context.fillStyle = sheen;
    context.fillRect(0, 0, width, height);

    const vignette = context.createRadialGradient(width * 0.48, height * 0.46, width * 0.22, width * 0.5, height * 0.5, width * 0.73);
    vignette.addColorStop(0, 'rgba(255,255,255,0)');
    vignette.addColorStop(1, 'rgba(5,7,9,.28)');
    context.globalAlpha = 1;
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);

    this.reflectionTexture.needsUpdate = true;
  }

  private drawCloud(context: CanvasRenderingContext2D, x: number, y: number, scale: number, alpha: number): void {
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.ellipse(x, y, 48 * scale, 15 * scale, -0.05, 0, Math.PI * 2);
    context.ellipse(x - 29 * scale, y + 3 * scale, 27 * scale, 11 * scale, -0.04, 0, Math.PI * 2);
    context.ellipse(x + 27 * scale, y + 2 * scale, 33 * scale, 12 * scale, 0.03, 0, Math.PI * 2);
    context.ellipse(x - 8 * scale, y - 10 * scale, 24 * scale, 19 * scale, 0.02, 0, Math.PI * 2);
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

  private trackTexture<T extends THREE.Texture>(texture: T): T {
    this.textures.push(texture);
    return texture;
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
  return new THREE.Color(from).lerp(new THREE.Color(to), t).getHex();
}

function colorCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}
