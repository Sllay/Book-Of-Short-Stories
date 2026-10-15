import * as THREE from 'three';
import type { WeatherSnapshot } from './WeatherController';

interface Bird {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  size: number;
}

const WIDTH = 512;
const HEIGHT = 512;
const WINDOW_X = 82;
const WINDOW_Y = 78;
const WINDOW_W = 348;
const WINDOW_H = 302;

export class BirdFlockOverlay {
  public readonly texture: THREE.CanvasTexture;

  private readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private readonly birds: Bird[] = [];
  private lastUpdateAt = 0;
  // The original 1–3 minute first wait made the feature look absent during normal tests.
  // Give a new session one observable passage, then return to genuinely occasional flocks.
  private nextSpawnAt = Date.now() + 12_000 + Math.random() * 18_000;
  private travelDirection: 1 | -1 = 1;

  public constructor() {
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D indisponível para o bando de pássaros.');
    this.context = context;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.clear();
  }

  public get active(): boolean {
    return this.birds.length > 0;
  }

  public update(date: Date, weather: WeatherSnapshot): boolean {
    const now = date.getTime();
    const hour = date.getHours() + date.getMinutes() / 60;
    const daylight = hour >= 5.7 && hour <= 18.75;
    const birdWeather = weather.rainIntensity < 0.22 && weather.cloudCover < 0.96;

    if (this.birds.length === 0 && daylight && birdWeather && now >= this.nextSpawnAt) {
      this.spawnFlock();
      this.lastUpdateAt = now;
    }

    if (this.birds.length === 0) return false;
    const delta = THREE.MathUtils.clamp((now - this.lastUpdateAt) / 1000, 0, 0.2);
    this.lastUpdateAt = now;
    this.stepBoids(delta);
    this.draw();

    const allGone = this.travelDirection > 0
      ? this.birds.every((bird) => bird.x > 1.2 || bird.y < -0.3 || bird.y > 1.3)
      : this.birds.every((bird) => bird.x < -0.2 || bird.y < -0.3 || bird.y > 1.3);
    if (allGone) {
      this.birds.length = 0;
      this.clear();
      this.nextSpawnAt = now + 90_000 + Math.random() * 150_000;
    }
    return true;
  }

  public dispose(): void {
    this.texture.dispose();
    this.birds.length = 0;
  }

  private spawnFlock(): void {
    this.birds.length = 0;
    this.travelDirection = Math.random() < 0.72 ? 1 : -1;
    const count = 8 + Math.floor(Math.random() * 7);
    const baseY = 0.2 + Math.random() * 0.35;

    for (let index = 0; index < count; index += 1) {
      const stagger = Math.random() * 0.18 + index * 0.012;
      const startX = this.travelDirection > 0
        ? -0.12 - stagger
        : 1.12 + stagger;
      const speed = 0.07 + Math.random() * 0.025;
      this.birds.push({
        x: startX,
        y: baseY + (Math.random() - 0.5) * 0.18,
        vx: speed * this.travelDirection,
        vy: (Math.random() - 0.5) * 0.02,
        phase: Math.random() * Math.PI * 2,
        size: 1.0 + Math.random() * 0.62
      });
    }
  }

  private stepBoids(delta: number): void {
    if (delta <= 0) return;
    const neighbors = this.birds;

    for (const bird of neighbors) {
      let centerX = 0;
      let centerY = 0;
      let alignX = 0;
      let alignY = 0;
      let separateX = 0;
      let separateY = 0;
      let nearby = 0;

      for (const other of neighbors) {
        if (other === bird) continue;
        const dx = other.x - bird.x;
        const dy = other.y - bird.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq > 0.052) continue;
        nearby += 1;
        centerX += other.x;
        centerY += other.y;
        alignX += other.vx;
        alignY += other.vy;
        if (distanceSq < 0.0075 && distanceSq > 0.000001) {
          separateX -= dx / distanceSq;
          separateY -= dy / distanceSq;
        }
      }

      if (nearby > 0) {
        centerX /= nearby;
        centerY /= nearby;
        alignX /= nearby;
        alignY /= nearby;
        bird.vx += (centerX - bird.x) * 0.012 * delta;
        bird.vy += (centerY - bird.y) * 0.014 * delta;
        bird.vx += (alignX - bird.vx) * 0.09 * delta;
        bird.vy += (alignY - bird.vy) * 0.09 * delta;
        bird.vx += separateX * 0.000032 * delta;
        bird.vy += separateY * 0.000032 * delta;
      }

      bird.vx += this.travelDirection * 0.008 * delta;
      bird.vy += Math.sin(bird.phase + bird.x * 8) * 0.0023 * delta;
      const speed = Math.hypot(bird.vx, bird.vy);
      const targetSpeed = THREE.MathUtils.clamp(speed, 0.065, 0.11);
      if (speed > 0.00001) {
        bird.vx = bird.vx / speed * targetSpeed;
        bird.vy = bird.vy / speed * targetSpeed;
      }
      if (Math.sign(bird.vx) !== this.travelDirection) bird.vx = Math.abs(bird.vx) * this.travelDirection;

      bird.x += bird.vx * delta;
      bird.y += bird.vy * delta;
      bird.phase += delta * (7.3 + bird.size * 2.2);
    }
  }

  private draw(): void {
    this.clear();
    const context = this.context;
    context.save();
    context.beginPath();
    context.rect(WINDOW_X, WINDOW_Y, WINDOW_W, WINDOW_H);
    context.clip();
    context.lineCap = 'round';
    context.lineJoin = 'round';

    for (const bird of this.birds) {
      const x = WINDOW_X + bird.x * WINDOW_W;
      const y = WINDOW_Y + bird.y * WINDOW_H;
      const wing = (2.8 + Math.sin(bird.phase) * 1.35) * bird.size;
      const body = 1.95 * bird.size;
      const angle = Math.atan2(bird.vy, bird.vx);

      context.save();
      context.translate(x, y);
      if (this.travelDirection < 0) context.scale(-1, 1);
      context.rotate(angle * 0.18);
      context.globalAlpha = THREE.MathUtils.clamp(0.62 + bird.size * 0.14, 0.72, 0.9);
      context.strokeStyle = '#1c2027';
      context.lineWidth = 1.18 * bird.size;
      context.beginPath();
      context.moveTo(-body, 0);
      context.quadraticCurveTo(-wing, -wing * 0.72, -wing * 1.55, -wing * 0.22);
      context.moveTo(body, 0);
      context.quadraticCurveTo(wing, -wing * 0.72, wing * 1.55, -wing * 0.22);
      context.stroke();
      context.restore();
    }
    context.restore();
    this.texture.needsUpdate = true;
  }

  private clear(): void {
    this.context.clearRect(0, 0, WIDTH, HEIGHT);
    this.texture.needsUpdate = true;
  }
}