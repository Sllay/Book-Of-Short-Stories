import type { QualityLevel, QualityProfile } from '../core/types';

const PROFILES: Record<QualityLevel, QualityProfile> = {
  high: { level: 'high', renderScale: 1, maxDevicePixelRatio: 2, ambientFps: 30 },
  balanced: { level: 'balanced', renderScale: 1, maxDevicePixelRatio: 1.5, ambientFps: 24 },
  low: { level: 'low', renderScale: 0.9, maxDevicePixelRatio: 1.25, ambientFps: 15 },
  safe: { level: 'safe', renderScale: 0.75, maxDevicePixelRatio: 1, ambientFps: 10 }
};
const ORDER: readonly QualityLevel[] = ['safe', 'low', 'balanced', 'high'];

export class PerformanceGovernor {
  private profile: QualityProfile = PROFILES.balanced;
  private slowSince: number | null = null;
  private healthySince: number | null = null;
  private readonly listeners = new Set<(profile: QualityProfile) => void>();

  public get current(): QualityProfile { return this.profile; }

  public subscribe(listener: (profile: QualityProfile) => void): () => void {
    this.listeners.add(listener);
    listener(this.profile);
    return () => this.listeners.delete(listener);
  }

  public reportAverageFrameTime(averageFrameTimeMs: number, now = performance.now()): void {
    if (averageFrameTimeMs <= 0) return;
    if (averageFrameTimeMs > 18) {
      this.healthySince = null;
      this.slowSince ??= now;
      if (now - this.slowSince >= 500) { this.stepDown(); this.slowSince = now; }
      return;
    }
    this.slowSince = null;
    if (averageFrameTimeMs < 12) {
      this.healthySince ??= now;
      if (now - this.healthySince >= 8_000) { this.stepUp(); this.healthySince = now; }
    } else this.healthySince = null;
  }

  public force(level: QualityLevel): void {
    this.setProfile(PROFILES[level]);
    this.slowSince = null;
    this.healthySince = null;
  }

  private stepDown(): void {
    const index = ORDER.indexOf(this.profile.level);
    if (index > 0) this.setProfile(PROFILES[ORDER[index - 1]]);
  }
  private stepUp(): void {
    const index = ORDER.indexOf(this.profile.level);
    if (index >= 0 && index < ORDER.length - 1) this.setProfile(PROFILES[ORDER[index + 1]]);
  }
  private setProfile(profile: QualityProfile): void {
    if (profile.level === this.profile.level) return;
    this.profile = profile;
    for (const listener of this.listeners) listener(profile);
  }
}
