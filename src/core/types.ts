export type RenderMode = 'static' | 'ambient' | 'interactive' | 'hidden';
export type QualityLevel = 'high' | 'balanced' | 'low' | 'safe';

export interface QualityProfile {
  readonly level: QualityLevel;
  readonly renderScale: number;
  readonly maxDevicePixelRatio: number;
  readonly ambientFps: number;
}

export interface PointerSnapshot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly normalizedX: number;
  readonly normalizedY: number;
  readonly isDown: boolean;
  readonly pressure: number;
  readonly timestamp: number;
}
