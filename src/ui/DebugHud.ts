import type { FrameStats } from '../performance/FrameMetrics';
import type { QualityProfile, RenderMode } from '../core/types';

export interface DebugHudState {
  readonly stats: FrameStats;
  readonly quality: QualityProfile;
  readonly mode: RenderMode;
  readonly pointerX: number;
  readonly pointerY: number;
}

export class DebugHud {
  private readonly element: HTMLDivElement;
  private readonly enabled: boolean;

  public constructor(container: HTMLElement) {
    const params = new URLSearchParams(window.location.search);
    this.enabled = params.get('debug') === '1';
    this.element = document.createElement('div');
    this.element.className = 'debug-hud';
    this.element.hidden = !this.enabled;
    container.append(this.element);
  }

  public update(state: DebugHudState): void {
    if (!this.enabled) return;
    const { stats, quality, mode, pointerX, pointerY } = state;
    this.element.textContent = [
      'Book of Short Stories', `mode     ${mode}`, `quality  ${quality.level}`,
      `fps      ${stats.fps.toFixed(1)}`, `frame    ${stats.averageFrameTimeMs.toFixed(2)} ms`,
      `scale    ${quality.renderScale.toFixed(2)}`, `pointer  ${pointerX.toFixed(2)}, ${pointerY.toFixed(2)}`
    ].join('\n');
  }
  public destroy(): void { this.element.remove(); }
}
