import * as THREE from 'three';
import { AmbientWeatherAudio } from '../audio/AmbientWeatherAudio';
import { BirdFlockOverlay } from './BirdFlockOverlay';
import { CandleRig } from './CandleRig';
import { ClockRig } from './ClockRig';
import { MirrorAtmosphere, type MirrorCelestialState } from './MirrorAtmosphere';
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

type CelestialState = MirrorCelestialState;

const PALETTE_STOPS: readonly PaletteStop[] = [
  { hour: 0, skyTop: 0x050d1a, skyBottom: 0x111a2d, ambientSky: 0x829bc5, ambientGround: 0x39323a, keyColor: 0xa8c4ff, keyIntensity: 0.48, hemisphereIntensity: 0.78, candleIntensity: 1.0, wallColor: 0x4b3936 },
  { hour: 3.5, skyTop: 0x0d182a, skyBottom: 0x283044, ambientSky: 0x91a5c4, ambientGround: 0x3e353b, keyColor: 0xadc7ef, keyIntensity: 0.5, hemisphereIntensity: 0.82, candleIntensity: 1.0, wallColor: 0x51403d },
  { hour: 5.2, skyTop: 0x314761, skyBottom: 0xba705b, ambientSky: 0xc7b6b0, ambientGround: 0x4b3c35, keyColor: 0xffaa75, keyIntensity: 0.82, hemisphereIntensity: 0.94, candleIntensity: 0.82, wallColor: 0x5b453e },
  { hour: 6.4, skyTop: 0x6a9fc4, skyBottom: 0xe0bc91, ambientSky: 0xf1d9bc, ambientGround: 0x5c4939, keyColor: 0xffc98e, keyIntensity: 1.36, hemisphereIntensity: 1.18, candleIntensity: 0.45, wallColor: 0x694f40 },
  { hour: 8.5, skyTop: 0x78b2d9, skyBottom: 0xe7dfc9, ambientSky: 0xffefd3, ambientGround: 0x6a5745, keyColor: 0xffd8a8, keyIntensity: 1.72, hemisphereIntensity: 1.42, candleIntensity: 0.2, wallColor: 0x735a48 },
  { hour: 15.8, skyTop: 0x77add3, skyBottom: 0xe6d7be, ambientSky: 0xffebce, ambientGround: 0x68523f, keyColor: 0xffd29b, keyIntensity: 1.62, hemisphereIntensity: 1.36, candleIntensity: 0.22, wallColor: 0x705744 },
  { hour: 17.4, skyTop: 0x7189a5, skyBottom: 0xe9a26e, ambientSky: 0xe4c8b2, ambientGround: 0x5b463a, keyColor: 0xffb375, keyIntensity: 1.2, hemisphereIntensity: 1.08, candleIntensity: 0.46, wallColor: 0x654b3d },
  { hour: 18.15, skyTop: 0x37445f, skyBottom: 0xa95e56, ambientSky: 0xb9adb2, ambientGround: 0x4a3a37, keyColor: 0xf49a72, keyIntensity: 0.78, hemisphereIntensity: 0.9, candleIntensity: 0.78, wallColor: 0x56413c },
  { hour: 18.85, skyTop: 0x091326, skyBottom: 0x222b43, ambientSky: 0x92a8cf, ambientGround: 0x3b343c, keyColor: 0xabc8ff, keyIntensity: 0.53, hemisphereIntensity: 0.8, candleIntensity: 0.98, wallColor: 0x4b3b3b },
  { hour: 24, skyTop: 0x050d1a, skyBottom: 0x111a2d, ambientSky: 0x829bc5, ambientGround: 0x39323a, keyColor: 0xa8c4ff, keyIntensity: 0.48, hemisphereIntensity: 0.78, candleIntensity: 1.0, wallColor: 0x4b3936 }
];

export class ReadingWorldController {
  public readonly root = new THREE.Group();

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly weather = new WeatherController();
  private readonly room = new RoomScene();
  private readonly candle = new CandleRig();
  private readonly clock = new ClockRig();
  private readonly mirrorAtmosphere = new MirrorAtmosphere();
  private readonly birds = new BirdFlockOverlay();
  private readonly ambientAudio = new AmbientWeatherAudio();
  private readonly mirrorMaterial: THREE.MeshBasicMaterial;
  private readonly birdOverlayMaterial: THREE.MeshBasicMaterial;
  private baseKeyIntensity = 1;
  private baseHemisphereIntensity = 1;
  private ambientSeconds = 0;
  private lastClockMinute = -1;
  private lastAtmosphereRenderAt = 0;
  private lastBirdUpdateAt = 0;
  private focusMode = false;
  private currentPalette: WorldPalette = samplePalette(new Date());
  private currentWeather: WeatherSnapshot = this.weather.current();
  private currentCelestial: CelestialState = celestialState(new Date());
  private lightningPulse = 0;
  private nextLightningAt = 0;

  public constructor(
    private readonly hemisphere: THREE.HemisphereLight,
    private readonly keyLight: THREE.DirectionalLight
  ) {
    this.root.add(this.room.root, this.clock.root);

    this.mirrorMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      map: this.mirrorAtmosphere.texture,
      transparent: true,
      opacity: 0.93,
      toneMapped: false,
      side: THREE.DoubleSide
    }));
    this.birdOverlayMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      map: this.birds.texture,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide
    }));

    this.root.add(this.createMirror());
    this.root.add(this.candle.root, this.candle.light);
    this.refreshClock(true);
  }

  public setFocusMode(enabled: boolean): void {
    if (this.focusMode === enabled) return;
    this.focusMode = enabled;
    this.mirrorMaterial.opacity = enabled ? 0.8 : 0.93;
    this.birdOverlayMaterial.opacity = enabled ? 0.78 : 0.9;
    this.candle.setFocusMode(enabled);
    this.refreshClock(true);
  }

  public notifyUserGesture(): void {
    this.ambientAudio.unlockFromGesture();
  }

  public update(deltaMs: number): void {
    const safeDelta = Math.max(0, Math.min(100, deltaMs));
    this.ambientSeconds += safeDelta / 1000;
    const now = new Date();
    const nowMs = now.getTime();

    this.refreshClock(false);
    this.clock.update(now);
    this.candle.update(now, safeDelta, this.ambientSeconds);
    this.updateLightning(safeDelta);

    this.keyLight.intensity = this.baseKeyIntensity + this.lightningPulse * 2.7;
    this.hemisphere.intensity = this.baseHemisphereIntensity + this.lightningPulse * 0.62;

    const birdInterval = this.birds.active ? 80 : 500;
    if (nowMs - this.lastBirdUpdateAt >= birdInterval) {
      this.lastBirdUpdateAt = nowMs;
      this.birds.update(now, this.currentWeather);
    }

    // Bird chirps were implemented originally but never received the flock's active
    // state from the world controller, so they could never play. Keep sound coupled to
    // the visible passage and to the same global audio preference as page foley.
    this.ambientAudio.update(this.currentWeather.rainIntensity, this.lightningPulse, this.birds.active);

    const atmosphereInterval = this.currentWeather.rainIntensity > 0.03 || this.lightningPulse > 0.002
      ? 90
      : (this.focusMode ? 240 : 180);
    if (nowMs - this.lastAtmosphereRenderAt >= atmosphereInterval) {
      this.lastAtmosphereRenderAt = nowMs;
      this.renderAtmosphere(now);
    }
  }

  public refreshClock(force = false): void {
    const now = new Date();
    const minuteKey = now.getHours() * 60 + now.getMinutes();
    if (!force && minuteKey === this.lastClockMinute) return;
    this.lastClockMinute = minuteKey;

    this.currentPalette = samplePalette(now);
    this.currentWeather = this.weather.current(now);
    this.currentCelestial = celestialState(now);
    this.applyLighting(now);
    this.clock.update(now, true);
    this.renderAtmosphere(now);
  }

  public dispose(): void {
    this.ambientAudio.dispose();
    this.birds.dispose();
    this.clock.dispose();
    this.room.dispose();
    this.candle.dispose();
    this.mirrorAtmosphere.dispose();
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

    const birdOverlay = new THREE.Mesh(this.trackGeometry(new THREE.CircleGeometry(0.758, 52)), this.birdOverlayMaterial);
    birdOverlay.position.z = 0.039;
    mirror.add(birdOverlay);

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

  private applyLighting(date: Date): void {
    const palette = this.currentPalette;
    const weather = this.currentWeather;
    const celestial = this.currentCelestial;

    this.hemisphere.color.setHex(palette.ambientSky);
    this.hemisphere.groundColor.setHex(palette.ambientGround);
    const cloudDim = 1 - weather.cloudCover * 0.18 - weather.rainIntensity * 0.12;
    this.baseHemisphereIntensity = palette.hemisphereIntensity * cloudDim * (this.focusMode ? 0.94 : 1);
    this.hemisphere.intensity = this.baseHemisphereIntensity;

    this.keyLight.color.setHex(palette.keyColor);
    this.baseKeyIntensity = palette.keyIntensity * (1 - weather.cloudCover * 0.32) * (this.focusMode ? 1.02 : 1);
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
    this.room.setAmbientReadability(this.baseHemisphereIntensity);
    if (date.getMinutes() % 15 === 0) this.weather.refreshIfGranted();
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

  private renderAtmosphere(now: Date): void {
    this.mirrorAtmosphere.draw(
      now,
      this.currentPalette,
      this.currentWeather,
      this.currentCelestial,
      this.ambientSeconds,
      this.lightningPulse
    );
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

function celestialState(date: Date): CelestialState {
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const sunT = THREE.MathUtils.clamp((hour - 5.35) / (18.3 - 5.35), 0, 1);
  const sunWindow = hour >= 5.35 && hour <= 18.3 ? 1 : 0;
  const sunStrength = sunWindow * THREE.MathUtils.smoothstep(Math.sin(Math.PI * sunT), 0, 0.3);

  const nightHour = hour < 6.2 ? hour + 24 : hour;
  const moonT = THREE.MathUtils.clamp((nightHour - 18.15) / (30.2 - 18.15), 0, 1);
  const moonWindow = nightHour >= 18.15 && nightHour <= 30.2 ? 1 : 0;
  const moonStrength = moonWindow * THREE.MathUtils.smoothstep(Math.sin(Math.PI * moonT), 0, 0.22);

  const dawnStars = 1 - THREE.MathUtils.smoothstep((hour - 3.5) / 2.2, 0, 1);
  const eveningStars = THREE.MathUtils.smoothstep((hour - 18.05) / 0.9, 0, 1);
  const starsStrength = THREE.MathUtils.clamp(Math.max(dawnStars, eveningStars) * (1 - sunStrength), 0, 1);
  return { sunStrength, moonStrength, sunT, moonT, starsStrength };
}

function lerpHex(from: number, to: number, t: number): number {
  return new THREE.Color(from).lerp(new THREE.Color(to), t).getHex();
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}
