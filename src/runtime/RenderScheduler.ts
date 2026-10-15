import type { RenderMode } from '../core/types';

export interface RenderFrameContext { readonly now: number; readonly deltaMs: number; }

const STATIC_AMBIENT_FPS = 8;

export class RenderScheduler {
  private mode: RenderMode = 'static';
  private animationFrameId: number | null = null;
  private dirty = true;
  private lastFrameAt = 0;
  private ambientFps = 24;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  public constructor(private readonly onFrame: (context: RenderFrameContext) => void) {}

  public get currentMode(): RenderMode { return this.mode; }

  public setAmbientFps(fps: number): void {
    this.ambientFps = Math.max(1, fps);
  }

  public setMode(mode: RenderMode): void {
    if (mode === this.mode) {
      if (mode === 'static') this.invalidate();
      return;
    }

    const previousMode = this.mode;
    this.mode = mode;

    if (mode === 'hidden') {
      this.cancel();
      this.lastFrameAt = 0;
      return;
    }

    // A static page may sit untouched for minutes. Never feed that idle duration into
    // frame-time metrics when interaction starts again.
    if (mode === 'interactive' && previousMode !== 'interactive') this.lastFrameAt = 0;

    this.invalidate();
  }

  public resetTiming(): void {
    this.lastFrameAt = 0;
  }

  public invalidate(): void {
    this.dirty = true;
    this.ensureScheduled();
  }

  public stop(): void {
    this.cancel();
    this.mode = 'hidden';
  }

  private ensureScheduled(): void {
    if (this.animationFrameId !== null || this.mode === 'hidden') return;
    this.animationFrameId = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    this.animationFrameId = null;
    if (this.mode === 'hidden') return;

    const ambientInterval = 1000 / this.ambientFps;
    const staticAmbient = this.mode === 'static' && !this.reducedMotion.matches;
    const staticInterval = 1000 / Math.min(this.ambientFps, STATIC_AMBIENT_FPS);
    const shouldRender = this.mode === 'interactive'
      || this.dirty
      || (this.mode === 'ambient' && (this.lastFrameAt === 0 || now - this.lastFrameAt >= ambientInterval))
      || (staticAmbient && (this.lastFrameAt === 0 || now - this.lastFrameAt >= staticInterval));

    if (shouldRender) {
      const deltaMs = this.lastFrameAt === 0 ? 0 : now - this.lastFrameAt;
      this.lastFrameAt = now;
      this.dirty = false;
      this.onFrame({ now, deltaMs });
    }

    if (this.mode === 'interactive' || this.mode === 'ambient' || staticAmbient || this.dirty) this.ensureScheduled();
  };

  private cancel(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}