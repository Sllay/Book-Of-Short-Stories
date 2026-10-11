import { InputController } from '../input/InputController';
import { FrameMetrics } from '../performance/FrameMetrics';
import { PerformanceGovernor } from '../performance/PerformanceGovernor';
import { ReaderRenderer } from '../render/ReaderRenderer';
import { RenderScheduler } from '../runtime/RenderScheduler';
import { DebugHud } from '../ui/DebugHud';
import type { PointerSnapshot } from './types';

export class App {
  private readonly shell: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: ReaderRenderer;
  private readonly input: InputController;
  private readonly metrics = new FrameMetrics();
  private readonly governor = new PerformanceGovernor();
  private readonly scheduler: RenderScheduler;
  private readonly debugHud: DebugHud;
  private readonly resizeObserver: ResizeObserver;
  private lastFrameTimestamp = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;

  public constructor(private readonly root: HTMLElement) {
    this.shell = document.createElement('div'); this.shell.className = 'reader-shell';
    this.canvas = document.createElement('canvas'); this.canvas.className = 'reader-canvas';
    this.canvas.setAttribute('aria-label', 'Área de leitura física virtual'); this.canvas.tabIndex = 0;
    const label = document.createElement('div'); label.className = 'foundation-label'; label.textContent = 'V1.1 • Runtime foundation';
    this.shell.append(this.canvas, label); this.root.append(this.shell);

    this.renderer = new ReaderRenderer(this.canvas, this.governor.current);
    this.input = new InputController(this.canvas);
    this.debugHud = new DebugHud(this.shell);
    this.scheduler = new RenderScheduler(({ now }) => {
      const deltaMs = this.lastFrameTimestamp === 0 ? 0 : now - this.lastFrameTimestamp;
      this.lastFrameTimestamp = now;
      this.renderer.render();
      const stats = this.metrics.record(deltaMs);
      this.governor.reportAverageFrameTime(stats.averageFrameTimeMs, now);
      this.updateDebug(stats);
    });

    this.input.subscribe(this.handlePointer);
    this.governor.subscribe((profile) => {
      this.renderer.setQuality(profile);
      this.scheduler.setAmbientFps(profile.ambientFps);
      this.scheduler.invalidate();
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.shell);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('orientationchange', this.resize);
  }

  public start(): void { this.resize(); this.scheduler.setMode(document.hidden ? 'hidden' : 'static'); this.scheduler.invalidate(); }
  public destroy(): void {
    this.scheduler.stop(); this.resizeObserver.disconnect(); this.input.destroy(); this.renderer.dispose(); this.debugHud.destroy();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('orientationchange', this.resize);
    this.shell.remove();
  }

  private readonly handlePointer = (pointer: PointerSnapshot): void => {
    this.lastPointerX = pointer.normalizedX; this.lastPointerY = pointer.normalizedY;
    this.renderer.updatePointer(pointer);
    if (pointer.isDown) this.scheduler.setMode('interactive');
    else { this.scheduler.setMode('static'); this.lastFrameTimestamp = 0; this.metrics.reset(); }
    this.scheduler.invalidate();
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) { this.scheduler.setMode('hidden'); this.metrics.reset(); this.lastFrameTimestamp = 0; return; }
    this.scheduler.setMode('static'); this.scheduler.invalidate();
  };

  private readonly resize = (): void => {
    const rect = this.shell.getBoundingClientRect();
    this.renderer.resize(rect.width, rect.height);
    this.scheduler.invalidate();
  };

  private updateDebug(stats = this.metrics.snapshot()): void {
    this.debugHud.update({ stats, quality: this.governor.current, mode: this.scheduler.currentMode, pointerX: this.lastPointerX, pointerY: this.lastPointerY });
  }
}
