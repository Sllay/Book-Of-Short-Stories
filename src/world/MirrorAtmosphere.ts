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
    wallGradient.addColorStop(0, colorCss(lerpHex(palette.wallColor, 0xa58a78, 0.14)));
    wallGradient.addColorStop(1, colorCss(lerpHex(palette.wallColor, 0x17120f, 0.2)));
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

    const daylight = celestial.sunStrength > 0.045;
    this.drawStars(date, wx, wy, ww, wh, celestial.starsStrength * (1 - weather.cloudCover * 0.72));
    this.drawCelestialBody(wx, wy, ww, wh, celestial);
    this.drawAtmosphericRays(wx, wy, ww, wh, celestial, weather, ambientSeconds);
    this.drawProceduralClouds(date, wx, wy, ww, wh, daylight, weather.cloudCover);
    this.drawWeatherHaze(wx, wy, ww, wh, weather, daylight);
    if (weather.rainIntensity > 0.025) this.drawRain(date, wx, wy, ww, wh, weather.rainIntensity);

    if (lightningPulse > 0) {
      context.globalAlpha = lightningPulse * 0.52;
      context.fillStyle = '#edf5ff';
      context.fillRect(wx, wy, ww, wh);
    }
    context.restore();

    // The mullions remain above the sky so light and clouds read as being behind glass.
    context.globalAlpha = 0.38;
    context.fillStyle = '#17130f';
    context.fillRect(wx + ww * 0.49, wy, ww * 0.022, wh);
    context.fillRect(wx, wy + wh * 0.5, ww, wh * 0.026);

    context.globalAlpha = 0.11;
    const sheen = context.createLinearGradient(0, 0, width, height);
    sheen.addColorStop(0.1, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.43, 'rgba(255,255,255,.32)');
    sheen.addColorStop(0.56, 'rgba(255,255,255,.045)');
    sheen.addColorStop(0.8, 'rgba(255,255,255,0)');
    context.fillStyle = sheen;
    context.fillRect(0, 0, width, height);

    const vignette = context.createRadialGradient(width * 0.48, height * 0.46, width * 0.22, width * 0.5, height * 0.5, width * 0.73);
    vignette.addColorStop(0, 'rgba(255,255,255,0)');
    vignette.addColorStop(1, 'rgba(5,7,9,.25)');
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
    for (let index = 0; index < 52; index += 1) {
      const sx = x + pseudoRandom(index * 3.17 + 1.2) * width;
      const sy = y + pseudoRandom(index * 7.31 + 4.8) * height * 0.72;
      const twinkle = 0.58 + Math.sin(time * (0.25 + pseudoRandom(index + 8) * 0.62) + index) * 0.2;
      context.globalAlpha = strength * Math.max(0.16, twinkle) * (0.45 + pseudoRandom(index * 5.1) * 0.55);
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
    const radius = isSun ? 19 : 13;
    const glow = context.createRadialGradient(cx, cy, radius * 0.18, cx, cy, radius * (isSun ? 3.5 : 3));
    glow.addColorStop(0, isSun ? 'rgba(255,242,184,.82)' : 'rgba(205,224,255,.5)');
    glow.addColorStop(0.42, isSun ? 'rgba(255,211,118,.20)' : 'rgba(177,205,255,.12)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    context.globalAlpha = strength;
    context.fillStyle = glow;
    context.fillRect(cx - radius * 4, cy - radius * 4, radius * 8, radius * 8);

    context.fillStyle = isSun ? '#ffe8a3' : '#dce8ff';
    context.globalAlpha = strength * (isSun ? 0.9 : 0.82);
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fill();

    if (!isSun) {
      context.save();
      context.globalAlpha = strength * 0.12;
      context.fillStyle = '#8294b5';
      for (let crater = 0; crater < 5; crater += 1) {
        const angle = pseudoRandom(crater * 4.7 + 1.3) * Math.PI * 2;
        const distance = pseudoRandom(crater * 8.1 + 2.4) * radius * 0.52;
        const craterRadius = 1.2 + pseudoRandom(crater * 3.2 + 8.7) * 2.1;
        context.beginPath();
        context.arc(cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance, craterRadius, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }
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
    const sourceStrength = isSun ? celestial.sunStrength : celestial.moonStrength * 0.34;
    if (sourceStrength < 0.04) return;

    const cloudPass = THREE.MathUtils.clamp(
      0.68 + Math.sin(ambientSeconds * 0.12) * 0.17 + Math.sin(ambientSeconds * 0.047 + 1.8) * 0.1,
      0.4,
      1
    );
    const visible = sourceStrength
      * (1 - weather.cloudCover * cloudPass)
      * (1 - weather.rainIntensity * 0.62);
    if (visible <= 0.018) return;

    const t = isSun ? celestial.sunT : celestial.moonT;
    const originX = x + width * THREE.MathUtils.lerp(0.12, 0.88, t);
    const originY = y + height * (0.74 - Math.sin(Math.PI * t) * 0.55);
    const gradient = context.createLinearGradient(originX, originY, x + width * 0.5, y + height);
    gradient.addColorStop(0, isSun
      ? `rgba(255,229,164,${(0.31 * visible).toFixed(3)})`
      : `rgba(196,216,255,${(0.115 * visible).toFixed(3)})`);
    gradient.addColorStop(0.45, isSun
      ? `rgba(255,221,150,${(0.12 * visible).toFixed(3)})`
      : `rgba(190,211,255,${(0.045 * visible).toFixed(3)})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.globalAlpha = 1;

    context.beginPath();
    context.moveTo(originX - 8, originY + 4);
    context.lineTo(x + width * 0.18, y + height);
    context.lineTo(x + width * 0.45, y + height);
    context.lineTo(originX + 6, originY + 5);
    context.closePath();
    context.fill();

    context.beginPath();
    context.moveTo(originX + 5, originY + 5);
    context.lineTo(x + width * 0.56, y + height);
    context.lineTo(x + width * 0.84, y + height);
    context.lineTo(originX + 17, originY + 7);
    context.closePath();
    context.fill();
  }

  private drawProceduralClouds(
    date: Date,
    x: number,
    y: number,
    width: number,
    height: number,
    daylight: boolean,
    cloudCover: number
  ): void {
    if (cloudCover < 0.035) return;
    const count = 2 + Math.round(cloudCover * 5);
    const seconds = date.getTime() / 1000;
    const daySeed = date.getFullYear() * 1000 + date.getMonth() * 50 + date.getDate();

    for (let index = 0; index < count; index += 1) {
      const seed = daySeed * 0.31 + index * 41.7;
      const distant = index % 3 === 0;
      const speed = (distant ? 0.0016 : 0.0024) + pseudoRandom(seed + 3) * (distant ? 0.0012 : 0.0018);
      const drift = (seconds * speed + pseudoRandom(seed + 1)) % 1.5;
      const cx = x + width * (drift - 0.24);
      const cy = y + height * ((distant ? 0.12 : 0.2) + pseudoRandom(seed + 2) * (distant ? 0.28 : 0.4));
      const scale = (distant ? 0.46 : 0.62) + pseudoRandom(seed + 4) * (distant ? 0.48 : 0.72);
      const density = THREE.MathUtils.clamp(0.32 + cloudCover * 0.62 + pseudoRandom(seed + 5) * 0.16, 0, 1);
      this.drawSoftCloud(cx, cy, scale, density, daylight, seed);
    }
  }

  private drawSoftCloud(
    x: number,
    y: number,
    scale: number,
    density: number,
    daylight: boolean,
    seed: number
  ): void {
    const context = this.context;
    const body = daylight ? '244,246,244' : '72,82,104';
    const highlight = daylight ? '255,253,244' : '111,124,151';
    const shadow = daylight ? '103,116,130' : '20,27,42';
    const puffCount = 9;
    context.save();

    // A soft shadow layer gives the cheap Canvas clouds enough depth to stop reading
    // like a flat translucent texture.
    for (let puff = 0; puff < puffCount; puff += 1) {
      const ox = (pseudoRandom(seed + puff * 11.7) - 0.5) * 76 * scale;
      const oy = (pseudoRandom(seed + puff * 19.3 + 2.4) - 0.5) * 27 * scale;
      const radius = (25 + pseudoRandom(seed + puff * 29.1 + 5.7) * 28) * scale;
      const sx = x + ox + 4 * scale;
      const sy = y + oy + 9 * scale;
      const alpha = (0.045 + density * 0.09) * (0.72 + pseudoRandom(seed + puff * 7.9) * 0.28);
      const shadowGradient = context.createRadialGradient(sx, sy, radius * 0.12, sx, sy, radius);
      shadowGradient.addColorStop(0, `rgba(${shadow},${alpha.toFixed(3)})`);
      shadowGradient.addColorStop(0.66, `rgba(${shadow},${(alpha * 0.48).toFixed(3)})`);
      shadowGradient.addColorStop(1, `rgba(${shadow},0)`);
      context.fillStyle = shadowGradient;
      context.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
    }

    for (let puff = 0; puff < puffCount; puff += 1) {
      const ox = (pseudoRandom(seed + puff * 11.7) - 0.5) * 76 * scale;
      const oy = (pseudoRandom(seed + puff * 19.3 + 2.4) - 0.5) * 27 * scale;
      const radius = (25 + pseudoRandom(seed + puff * 29.1 + 5.7) * 28) * scale;
      const px = x + ox;
      const py = y + oy;
      const alpha = (0.12 + density * 0.17) * (0.72 + pseudoRandom(seed + puff * 7.9) * 0.28);
      const gradient = context.createRadialGradient(
        px - radius * 0.2,
        py - radius * 0.24,
        radius * 0.05,
        px,
        py,
        radius
      );
      gradient.addColorStop(0, `rgba(${highlight},${Math.min(0.42, alpha * 1.18).toFixed(3)})`);
      gradient.addColorStop(0.4, `rgba(${body},${alpha.toFixed(3)})`);
      gradient.addColorStop(0.72, `rgba(${body},${(alpha * 0.58).toFixed(3)})`);
      gradient.addColorStop(1, `rgba(${body},0)`);
      context.fillStyle = gradient;
      context.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    }
    context.restore();
  }

  private drawWeatherHaze(
    x: number,
    y: number,
    width: number,
    height: number,
    weather: WeatherSnapshot,
    daylight: boolean
  ): void {
    const amount = THREE.MathUtils.clamp(weather.cloudCover * 0.14 + weather.rainIntensity * 0.24, 0, 0.3);
    if (amount <= 0.01) return;
    const context = this.context;
    const haze = context.createLinearGradient(0, y, 0, y + height);
    haze.addColorStop(0, 'rgba(255,255,255,0)');
    haze.addColorStop(1, daylight
      ? `rgba(190,203,210,${amount.toFixed(3)})`
      : `rgba(37,47,64,${amount.toFixed(3)})`);
    context.globalAlpha = 1;
    context.fillStyle = haze;
    context.fillRect(x, y, width, height);
  }

  private drawRain(date: Date, x: number, y: number, width: number, height: number, intensity: number): void {
    const context = this.context;
    const count = Math.round(34 + intensity * 82);
    const tick = date.getTime() / 34;
    context.save();
    context.strokeStyle = `rgba(192,214,235,${(0.11 + intensity * 0.22).toFixed(3)})`;
    context.lineWidth = 0.75 + intensity * 0.7;
    for (let index = 0; index < count; index += 1) {
      const seed = index * 17.3;
      const rx = x + ((pseudoRandom(seed + 1) * width + tick * (0.08 + pseudoRandom(seed + 2) * 0.09)) % width);
      const ry = y + ((pseudoRandom(seed + 3) * height + tick * (0.9 + intensity * 1.6)) % height);
      const length = 6 + pseudoRandom(seed + 4) * 11 + intensity * 9;
      context.beginPath();
      context.moveTo(rx, ry);
      context.lineTo(rx - 2.2 - intensity * 1.8, ry + length);
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