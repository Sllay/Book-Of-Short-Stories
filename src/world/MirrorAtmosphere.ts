import * as THREE from 'three';
import type { WeatherSnapshot } from './WeatherController';

export interface MirrorPalette {
  readonly skyTop: number;
  readonly skyBottom: number;
  readonly wallColor: number;
}

export interface MirrorCelestialState {
  readonly sunStrength: number;
  readonly moonStrength: number;
  readonly sunT: number;
  readonly moonT: number;
  readonly starsStrength: number;
}

export class MirrorAtmosphere {
  public readonly texture: THREE.CanvasTexture;

  private readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;

  public constructor() {
    this.canvas.width = 512;
    this.canvas.height = 512;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D indisponível para o reflexo do ambiente.');
    this.context = context;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
  }

  public draw(
    date: Date,
    palette: MirrorPalette,
    weather: WeatherSnapshot,
    celestial: MirrorCelestialState,
    ambientSeconds: number,
    lightningPulse: number
  ): void {
    const context = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;

    const wallGradient = context.createLinearGradient(0, 0, 0, height);
    wallGradient.addColorStop(0, colorCss(lerpHex(palette.wallColor, 0x9b806e, 0.12)));
    wallGradient.addColorStop(1, colorCss(lerpHex(palette.wallColor, 0x17120f, 0.22)));
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

    this.drawStars(date, wx, wy, ww, wh, celestial.starsStrength * (1 - weather.cloudCover * 0.7));
    this.drawCelestialBody(wx, wy, ww, wh, celestial);
    this.drawAtmosphericRays(wx, wy, ww, wh, celestial, weather, ambientSeconds);
    this.drawProceduralClouds(date, wx, wy, ww, wh, celestial.sunStrength > 0.04, weather.cloudCover);
    if (weather.rainIntensity > 0.03) this.drawRain(date, wx, wy, ww, wh, weather.rainIntensity);

    if (lightningPulse > 0) {
      context.globalAlpha = lightningPulse * 0.46;
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

    this.texture.needsUpdate = true;
  }

  public dispose(): void {
    this.texture.dispose();
  }

  private drawStars(date: Date, x: number, y: number, width: number, height: number, strength: number): void {
    if (strength <= 0.01) return;
    const time = date.getTime() / 1000;
    const context = this.context;
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

  private drawCelestialBody(x: number, y: number, width: number, height: number, celestial: MirrorCelestialState): void {
    const context = this.context;
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

  private drawAtmosphericRays(
    x: number,
    y: number,
    width: number,
    height: number,
    celestial: MirrorCelestialState,
    weather: WeatherSnapshot,
    ambientSeconds: number
  ): void {
    const context = this.context;
    const isSun = celestial.sunStrength >= celestial.moonStrength;
    const sourceStrength = isSun ? celestial.sunStrength : celestial.moonStrength * 0.32;
    if (sourceStrength < 0.04) return;

    const cloudPass = 0.78 + Math.sin(ambientSeconds * 0.12) * 0.12;
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

  private drawProceduralClouds(date: Date, x: number, y: number, width: number, height: number, daylight: boolean, cloudCover: number): void {
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
      this.drawSoftCloud(cx, cy, scale, density, daylight);
    }
  }

  private drawSoftCloud(x: number, y: number, scale: number, density: number, daylight: boolean): void {
    const context = this.context;
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

  private drawRain(date: Date, x: number, y: number, width: number, height: number, intensity: number): void {
    const context = this.context;
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
