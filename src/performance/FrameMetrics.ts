export interface FrameStats {
  readonly frameTimeMs: number;
  readonly averageFrameTimeMs: number;
  readonly fps: number;
}

export class FrameMetrics {
  private readonly samples: number[] = [];
  public constructor(private readonly maxSamples = 90) {}

  public record(frameTimeMs: number): FrameStats {
    if (!Number.isFinite(frameTimeMs) || frameTimeMs <= 0) return this.snapshot();
    this.samples.push(frameTimeMs);
    if (this.samples.length > this.maxSamples) this.samples.shift();
    return this.snapshot(frameTimeMs);
  }

  public reset(): void { this.samples.length = 0; }

  public snapshot(lastFrameTimeMs = this.samples.at(-1) ?? 0): FrameStats {
    if (this.samples.length === 0) return { frameTimeMs: lastFrameTimeMs, averageFrameTimeMs: 0, fps: 0 };
    const total = this.samples.reduce((sum, value) => sum + value, 0);
    const averageFrameTimeMs = total / this.samples.length;
    return { frameTimeMs: lastFrameTimeMs, averageFrameTimeMs, fps: averageFrameTimeMs > 0 ? 1000 / averageFrameTimeMs : 0 };
  }
}
