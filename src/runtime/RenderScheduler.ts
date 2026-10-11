import type { RenderMode } from '../core/types';

export interface RenderFrameContext { readonly now: number; readonly deltaMs: number; }

export class RenderScheduler {
  private mode: RenderMode = 'static';
  private animationFrameId: number | null = null;
  private dirty = true;
  private lastFrameAt = 0;
  private ambientFps = 24;

  public constructor(private readonly onFrame: (context: RenderFrameContext) => void) {}
  public get currentMode(): RenderMode { return this.mode; }
  public setAmbientFps(fps: number): void { this.ambientFps = Math.max(1, fps); }

  public setMode(mode: RenderMode): void {
    if (mode === this.mode) { if (mode === 'static') this.invalidate(); return; }
    this.mode = mode;
    if (mode === 'hidden') { this.cancel(); this.lastFrameAt = 0; return; }
    this.invalidate();
  }

  public invalidate(): void { this.dirty = true; this.ensureScheduled(); }
  public stop(): void { this.cancel(); this.mode = 'hidden'; }

  private ensureScheduled(): void {
    if (this.animationFrameId !== null || this.mode === 'hidden') return;
    this.animationFrameId = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    this.animationFrameId = null;
    if (this.mode === 'hidden') return;
    const ambientInterval = 1000 / this.ambientFps;
    const shouldRender = this.mode === 'interactive' || this.dirty || (this.mode === 'ambient' && (this.lastFrameAt === 0 || now - this.lastFrameAt >= ambientInterval));
    if (shouldRender) {
      const deltaMs = this.lastFrameAt === 0 ? 0 : now - this.lastFrameAt;
      this.lastFrameAt = now;
      this.dirty = false;
      this.onFrame({ now, deltaMs });
    }
    if (this.mode === 'interactive' || this.mode === 'ambient' || this.dirty) this.ensureScheduled();
  };

  private cancel(): void {
    if (this.animationFrameId !== null) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
  }
}
