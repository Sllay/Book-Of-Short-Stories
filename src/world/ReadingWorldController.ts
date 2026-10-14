import * as THREE from 'three';
import { CandleRig } from './CandleRig';
import { RoomScene } from './RoomScene';
import { WeatherController, type WeatherSnapshot } from './WeatherController';

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

interface CelestialState {
  readonly sunStrength: number;
  readonly moonStrength: number;
  readonly sunT: number;
  readonly moonT: number;
  readonly starsStrength: number;
}

const PALETTE_STOPS: readonly PaletteStop[] = [
  { hour: 0, skyTop: 0x06101f, skyBottom: 0x141d34, ambientSky: 0x7f9bc7, ambientGround: 0x25212a, keyColor: 0x9dbfff, keyIntensity: 0.44, hemisphereIntensity: 0.66, candleIntensity: 1.0, wallColor: 0x231e22 },
  { hour: 3.5, skyTop: 0x101c30, skyBottom: 0x2d3245, ambientSky: 0x8da1bd, ambientGround: 0x302830, keyColor: 0xa8c3ed, keyIntensity: 0.48, hemisphereIntensity: 0.72, candleIntensity: 1.0, wallColor: 0x2b2427 },
  { hour: 5.2, skyTop: 0x314761, skyBottom: 0xba705b, ambientSky: 0xc7b6b0, ambientGround: 0x46372f, keyColor: 0xffaa75, keyIntensity: 0.82, hemisphereIntensity: 0.9, candleIntensity: 0.82, wallColor: 0x43342f },
  { hour: 6.4, skyTop: 0x6a9fc4, skyBottom: 0xe0bc91, ambientSky: 0xf1d9bc, ambientGround: 0x5c4939, keyColor: 0xffc98e, keyIntensity: 1.36, hemisphereIntensity: 1.18, candleIntensity: 0.45, wallColor: 0x594437 },
  { hour: 8.5, skyTop: 0x78b2d9, skyBottom: 0xe7dfc9, ambientSky: 0xffefd3, ambientGround: 0x6a5745, keyColor: 0xffd8a8, keyIntensity: 1.72, hemisphereIntensity: 1.42, candleIntensity: 0.2, wallColor: 0x665141 },
  { hour: 15.8, skyTop: 0x77add3, skyBottom: 0xe6d7be, ambientSky: 0xffebce, ambientGround: 0x68523f, keyColor: 0xffd29b, keyIntensity: 1.62, hemisphereIntensity: 1.36, candleIntensity: 0.22, wallColor: 0x64503f },
  { hour: 17.6, skyTop: 0x7087a4, skyBottom: 0xe6a06e, ambientSky: 0xe4c8b2, ambientGround: 0x594235, keyColor: 0xffb375, keyIntensity: 1.22, hemisphereIntensity: 1.08, candleIntensity: 0.46, wallColor: 0x594238 },
  { hour: 18.7, skyTop: 0x39465f, skyBottom: 0xbd6a58, ambientSky: 0xbcaeb1, ambientGround: 0x41332f, keyColor: 0xf6976b, keyIntensity: 0.82, hemisphereIntensity: 0.86, candleIntensity: 0.78, wallColor: 0x40322f },
  { hour: 20.2, skyTop: 0x0b1528, skyBottom: 0x27304a, ambientSky: 0x8fa8d0, ambientGround: 0x2b2630, keyColor: 0xaac8ff, keyIntensity: 0.5, hemisphereIntensity: 0.72, candleIntensity: 0.98, wallColor: 0x282228 },
  { hour: 24, skyTop: 0x06101f, skyBottom: 0x141d34, ambientSky: 0x7f9bc7, ambientGround: 0x25212a, keyColor: 0x9dbfff, keyIntensity: 0.44, hemisphereIntensity: 0.66, candleIntensity: 1.0, wallColor: 0x231e22 }
];

export class ReadingWorldController {
  public readonly root = new THREE.Group();

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly weather = new WeatherController();
  private readonly room = new RoomScene();
  private readonly candle = new CandleRig();
  private readonly mirrorMaterial: THREE.MeshBasicMaterial;
  private readonly reflectionCanvas = document.createElement('canvas');
  private readonly reflectionContext: CanvasRenderingContext2D;
  private readonly reflectionTexture: THREE.CanvasTexture;
  private readonly beamMaterials: THREE.MeshBasicMaterial[] = [];
  private baseKeyIntensity = 1;
  private baseHemisphereIntensity = 1;
  private ambientSeconds = 0;
  private lastClockMinute = -1;
  private lastReflectionTick = -1;
  private focusMode = false;
  private currentWeather: WeatherSnapshot = this.weather.current();
  private currentCelestial: CelestialState = celestialState(new Date());
  private lightningPulse = 0;
  private nextLightningAt = 0;

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

    this.root.add(this.room.root);

    this.mirrorMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      map: this.reflectionTexture,
      transparent: true,
      opacity: 0.88,
      toneMapped: false,
      side: THREE.DoubleSide
    }));
    this.root.add(this.createMirror());
    this.root.add(this.createWindowBeams());

    this.root.add(this.candle.root, this.candle.light);
    this.refreshClock(true);
  }

  public setFocusMode(enabled: boolean): void {
    if (this.focusMode === enabled) return;
    this.focusMode = enabled;
    this.mirrorMaterial.opacity = enabled ? 0.26 : 0.88;
    this.candle.setFocusMode(enabled);
    this.refreshClock(true);
  }

  public update(deltaMs: number): void {
    const safeDelta = Math.max(0, Math.min(100, deltaMs));
    this.ambientSeconds += safeDelta / 1000;
    const now = new Date();

    this.candle.update(now, safeDelta, this.ambientSeconds);
    this.updateLightning(safeDelta);
    this.updateWindowBeams();

    this.keyLight.intensity = this.baseKeyIntensity + this.lightningPulse * 2.7;
    this.hemisphere.intensity = this.baseHemisphereIntensity + this.lightningPulse * 0.62;

    const reflectionTick = Math.floor(Date.now() / 1000);
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
    this.currentWeather = this.weather.current(now);
    this.currentCelestial = celestialState(now);
    this.applyLighting(palette, now, this.currentWeather, this.currentCelestial);
    this.drawMirrorReflection(now, palette, this.currentWeather, this.currentCelestial);
  }

  public dispose(): void {
    this.room.dispose();
    this.candle.dispose();
    this.reflectionTexture.dispose();
    for (const texture of this.textures) texture.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
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

    const back = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.88, 0.88, 0.055, 52)), frameMaterial);
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

  private createWindowBeams(): THREE.Group {
    const group = new THREE.Group();
    group.position.set(0, -0.1, 0.25);

    for (let index = 0; index < 2; index += 1) {
      const material = this.trackMaterial(new THREE.MeshBasicMaterial({
        color: index === 0 ? 0xffdf9d : 0xffe9be,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        side: THREE.DoubleSide
      }));
      this.beamMaterials.push(material);
      const beam = new THREE.Mesh(this.trackGeometry(new THREE.PlaneGeometry(0.52, 4.7)), material);
      beam.rotation.x = Math.PI / 2 - 0.045;
      beam.rotation.z = index === 0 ? -0.04 : 0.04;
      beam.position.set(index === 0 ? -0.62 : 0.56, 0, 0.95);
      group.add(beam);
    }

    return group;
  }

  private applyLighting(
    palette: WorldPalette,
    date: Date,
    weather: WeatherSnapshot,
    celestial: CelestialState
  ): void {
    this.hemisphere.color.setHex(palette.ambientSky);
    this.hemisphere.groundColor.setHex(palette.ambientGround);

    const cloudDim = 1 - weather.cloudCover * 0.18 - weather.rainIntensity * 0.12;
    this.baseHemisphereIntensity = palette.hemisphereIntensity * cloudDim * (this.focusMode ? 0.76 : 1);
    this.hemisphere.intensity = this.baseHemisphereIntensity;

    this.keyLight.color.setHex(palette.keyColor);
    this.baseKeyIntensity = palette.keyIntensity * (1 - weather.cloudCover * 0.32) * (this.focusMode ? 1.08 : 1);
    this.keyLight.intensity = this.baseKeyIntensity;

    const activeT = celestial.sunStrength > 0.02 ? celestial.sunT : celestial.moonT;
    const arcHeight = Math.sin(Math.PI * activeT);
    this.keyLight.position.set(
      THREE.MathUtils.lerp(-5.1, 5.1, activeT),
      THREE.MathUtils.lerp(-2.7, -0.6, arcHeight),
      3.5 + arcHeight * 4.2
    );

    this.candle.setBaseIntensity(palette.candleIntensity * (1 + weather.rainIntensity * 0.08));
    this.room.setWallColor(palette.wallColor);
    if (date.getMinutes() % 15 === 0) this.weather.refreshIfGranted();
  }

  private updateWindowBeams(): void {
    const celestial = this.currentCelestial;
    const weather = this.currentWeather;
    const sun = celestial.sunStrength;
    const moon = celestial.moonStrength * 0.22;
    const source = sun > moon ? sun : moon;
    const passingCloud = 0.78 + Math.sin(this.ambientSeconds * 0.115 + 0.7) * 0.12 + Math.sin(this.ambientSeconds * 0.043) * 0.1;
    const visibility = THREE.MathUtils.clamp(
      source * (1 - weather.cloudCover * THREE.MathUtils.clamp(passingCloud, 0.55, 1)) * (1 - weather.rainIntensity * 0.45),
      0,
      1
    );

    for (let index = 0; index < this.beamMaterials.length; index += 1) {
      const material = this.beamMaterials[index];
      material.color.setHex(sun >= moon ? 0xffdf9d : 0xbfd5ff);
      material.opacity = visibility * (sun >= moon ? 0.075 : 0.028) * (index === 0 ? 1 : 0.82);
    }
  }

  private updateLightning(deltaMs: number): void {
    const now = Date.now();
    if (this.currentWeather.thunderChance > 0.05) {
      if (this.nextLightningAt === 0) {
        this.nextLightningAt = now + 7000 + pseudoRandom(now * 0.0001) * 19000;
      } else if (now >= this.nextLightningAt) {
        this.lightningPulse = 1;
        const spread = 12000 + pseudoRandom(now * 0.00017 + 9.1) * 33000;
        this.nextLightningAt = now + spread / Math.max(0.28, this.currentWeather.thunderChance);
      }
    } else {
      this.nextLightningAt = 0;
    }

    this.lightningPulse *= Math.exp(-deltaMs / 115);
    if (this.lightningPulse < 0.002) this.lightningPulse = 0;
  }

  private drawMirrorReflection(
    date: Date,
    palette: WorldPalette,
    weather: WeatherSnapshot,
    celestial: CelestialState
  ): void {
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

    const skyGradient = context.createLinearGradient(0, wy, 0, wy + wh);
    skyGradient.addColorStop(0, colorCss(palette.skyTop));
    skyGradient.addColorStop(1, colorCss(palette.skyBottom));
    context.fillStyle = skyGradient;
    context.fillRect(wx, wy, ww, wh);

    context.save();
    context.beginPath();
    context.rect(wx, wy, ww, wh);
    context.clip();

    this.drawStars(context, date, wx, wy, ww, wh, celestial.starsStrength * (1 - weather.cloudCover * 0.7));
    this.drawCelestialBody(context, wx, wy, ww, wh, celestial);
    this.drawAtmosphericRays(context, wx, wy, ww, wh, celestial, weather);
    this.drawProceduralClouds(context, date, wx, wy, ww, wh, celestial.sunStrength > 0.04, weather.cloudCover);
    if (weather.rainIntensity > 0.03) this.drawRain(context, date, wx, wy, ww, wh, weather.rainIntensity);

    if (this.lightningPulse > 0) {
      context.globalAlpha = this.lightningPulse * 0.46;
      context.fillStyle = '#e9f2ff';
      context.fillRect(wx, wy, ww, wh);
    }
    context.restore();

    context.globalAlpha = 0.32;
    context.fillStyle = '#17130f';
    context.fillRect(wx + ww * 0.49, wy, ww * 0.022, wh);
    context.fillRect(wx, wy + wh * 0.5, ww, wh * 0.026);

    context.globalAlpha = 0.1;
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

  private drawStars(context: CanvasRenderingContext2D, date: Date, x: number, y: number, width: number, height: number, strength: number): void {
    if (strength <= 0.01) return;
    const time = date.getTime() / 1000;
    context.save();
    for (let index = 0; index < 44; index += 1) {
      const sx = x + pseudoRandom(index * 3.17 + 1.2) * width;
      const sy = y + pseudoRandom(index * 7.31 + 4.8) * height * 0.72;
      const twinkle = 0.55 + Math.sin(time * (0.35 + pseudoRandom(index + 8) * 0.75) + index) * 0.22;
      context.globalAlpha = strength * Math.max(0.14, twinkle) * (0.45 + pseudoRandom(index * 5.1) * 0.55);
      context.fillStyle = index % 7 === 0 ? '#dce8ff' : '#fff8e8';
      context.beginPath();
      context.arc(sx, sy, 0.55 + pseudoRandom(index * 9.3) * 1.05, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  private drawCelestialBody(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, celestial: CelestialState): void {
    const isSun = celestial.sunStrength >= celestial.moonStrength;
    const strength = isSun ? celestial.sunStrength : celestial.moonStrength;
    if (strength <= 0.01) return;
    const t = isSun ? celestial.sunT : celestial.moonT;
    const cx = x + width * THREE.MathUtils.lerp(0.12, 0.88, t);
    const cy = y + height * (0.74 - Math.sin(Math.PI * t) * 0.55);
    const radius = isSun ? 18 : 12;

    const glow = context.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 2.7);
    glow.addColorStop(0, isSun ? 'rgba(255,240,177,.70)' : 'rgba(210,226,255,.42)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    context.globalAlpha = strength;
    context.fillStyle = glow;
    context.fillRect(cx - radius * 3, cy - radius * 3, radius * 6, radius * 6);

    context.fillStyle = isSun ? '#ffe7a0' : '#dce8ff';
    context.globalAlpha = strength * (isSun ? 0.76 : 0.68);
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fill();
  }

  private drawAtmosphericRays(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, celestial: CelestialState, weather: WeatherSnapshot): void {
    const isSun = celestial.sunStrength >= celestial.moonStrength;
    const sourceStrength = isSun ? celestial.sunStrength : celestial.moonStrength * 0.32;
    if (sourceStrength < 0.04) return;

    const cloudPass = 0.78 + Math.sin(this.ambientSeconds * 0.12) * 0.12;
    const visible = sourceStrength * (1 - weather.cloudCover * cloudPass) * (1 - weather.rainIntensity * 0.55);
    if (visible <= 0.02) return;

    const t = isSun ? celestial.sunT : celestial.moonT;
    const originX = x + width * THREE.MathUtils.lerp(0.12, 0.88, t);
    const originY = y + height * (0.74 - Math.sin(Math.PI * t) * 0.55);
    const gradient = context.createLinearGradient(originX, originY, x + width * 0.5, y + height);
    gradient.addColorStop(0, isSun ? `rgba(255,229,164,${(0.18 * visible).toFixed(3)})` : `rgba(196,216,255,${(0.08 * visible).toFixed(3)})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.globalAlpha = 1;

    context.beginPath();
    context.moveTo(originX - 7, originY + 4);
    context.lineTo(x + width * 0.22, y + height);
    context.lineTo(x + width * 0.46, y + height);
    context.lineTo(originX + 8, originY + 5);
    context.closePath();
    context.fill();

    context.beginPath();
    context.moveTo(originX + 5, originY + 5);
    context.lineTo(x + width * 0.58, y + height);
    context.lineTo(x + width * 0.81, y + height);
    context.lineTo(originX + 15, originY + 7);
    context.closePath();
    context.fill();
  }

  private drawProceduralClouds(context: CanvasRenderingContext2D, date: Date, x: number, y: number, width: number, height: number, daylight: boolean, cloudCover: number): void {
    if (cloudCover < 0.045) return;
    const count = 1 + Math.round(cloudCover * 4);
    const seconds = date.getTime() / 1000;
    const daySeed = date.getFullYear() * 1000 + date.getMonth() * 50 + date.getDate();

    for (let index = 0; index < count; index += 1) {
      const seed = daySeed * 0.31 + index * 41.7;
      const speed = 0.0025 + pseudoRandom(seed + 3) * 0.0022;
      const drift = (seconds * speed + pseudoRandom(seed + 1)) % 1.35;
      const cx = x + width * (drift - 0.18);
      const cy = y + height * (0.18 + pseudoRandom(seed + 2) * 0.42);
      const scale = 0.58 + pseudoRandom(seed + 4) * 0.72;
      const density = THREE.MathUtils.clamp(0.34 + cloudCover * 0.58 + pseudoRandom(seed + 5) * 0.12, 0, 1);
      this.drawSoftCloud(context, cx, cy, scale, density, daylight);
    }
  }

  private drawSoftCloud(context: CanvasRenderingContext2D, x: number, y: number, scale: number, density: number, daylight: boolean): void {
    const cloudColor = daylight ? '238,241,239' : '54,63,80';
    context.save();
    for (let layer = 0; layer < 7; layer += 1) {
      const ox = (pseudoRandom(layer * 11.7 + x * 0.001) - 0.5) * 62 * scale;
      const oy = (pseudoRandom(layer * 19.3 + y * 0.001) - 0.5) * 22 * scale;
      const radius = (28 + pseudoRandom(layer * 29.1) * 30) * scale;
      const gradient = context.createRadialGradient(x + ox, y + oy, radius * 0.08, x + ox, y + oy, radius);
      const alpha = (0.075 + density * 0.075) * (0.7 + pseudoRandom(layer * 7.9) * 0.3);
      gradient.addColorStop(0, `rgba(${cloudColor},${alpha.toFixed(3)})`);
      gradient.addColorStop(0.62, `rgba(${cloudColor},${(alpha * 0.58).toFixed(3)})`);
      gradient.addColorStop(1, `rgba(${cloudColor},0)`);
      context.fillStyle = gradient;
      context.fillRect(x + ox - radius, y + oy - radius, radius * 2, radius * 2);
    }
    context.restore();
  }

  private drawRain(context: CanvasRenderingContext2D, date: Date, x: number, y: number, width: number, height: number, intensity: number): void {
    const count = Math.round(28 + intensity * 72);
    const tick = date.getTime() / 34;
    context.save();
    context.strokeStyle = `rgba(192,214,235,${(0.08 + intensity * 0.18).toFixed(3)})`;
    context.lineWidth = 0.7 + intensity * 0.6;
    for (let index = 0; index < count; index += 1) {
      const seed = index * 17.3;
      const rx = x + ((pseudoRandom(seed + 1) * width + tick * (0.08 + pseudoRandom(seed + 2) * 0.09)) % width);
      const ry = y + ((pseudoRandom(seed + 3) * height + tick * (0.9 + intensity * 1.6)) % height);
      const length = 5 + pseudoRandom(seed + 4) * 10 + intensity * 8;
      context.beginPath();
      context.moveTo(rx, ry);
      context.lineTo(rx - 2.1 - intensity * 1.7, ry + length);
      context.stroke();
    }
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

function celestialState(date: Date): CelestialState {
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const sunT = THREE.MathUtils.clamp((hour - 5.35) / (18.65 - 5.35), 0, 1);
  const sunWindow = hour >= 5.35 && hour <= 18.65 ? 1 : 0;
  const sunStrength = sunWindow * THREE.MathUtils.smoothstep(Math.sin(Math.PI * sunT), 0, 0.3);

  const nightHour = hour < 6.2 ? hour + 24 : hour;
  const moonT = THREE.MathUtils.clamp((nightHour - 18.2) / (30.2 - 18.2), 0, 1);
  const moonWindow = nightHour >= 18.2 && nightHour <= 30.2 ? 1 : 0;
  const moonStrength = moonWindow * THREE.MathUtils.smoothstep(Math.sin(Math.PI * moonT), 0, 0.22);

  const twilight = THREE.MathUtils.clamp(Math.max(
    smoothRange(hour, 3.5, 5.7),
    smoothRange(20.0, 18.2, hour)
  ), 0, 1);
  const starsStrength = THREE.MathUtils.clamp(Math.max(moonWindow, twilight) * (1 - sunStrength * 1.4), 0, 1);
  return { sunStrength, moonStrength, sunT, moonT, starsStrength };
}

function smoothRange(value: number, start: number, end: number): number {
  if (start === end) return 0;
  return THREE.MathUtils.clamp((value - start) / (end - start), 0, 1);
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
