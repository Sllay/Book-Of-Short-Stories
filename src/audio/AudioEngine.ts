export type PaperTurnDirection = 'forward' | 'backward';

export class AudioEngine {
  private context: AudioContext | null = null;
  private paperNoise: AudioBuffer | null = null;
  private enabled = true;

  public get isEnabled(): boolean { return this.enabled; }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.context?.state === 'running') void this.context.suspend();
  }

  public unlockFromGesture(): void {
    if (!this.enabled) return;
    const context = this.ensureContext();
    if (context.state === 'suspended') void context.resume();
  }

  public playPageTurn(direction: PaperTurnDirection): void {
    if (!this.enabled) return;
    const context = this.ensureContext();
    if (context.state !== 'running') return;

    const source = context.createBufferSource();
    source.buffer = this.paperNoise ?? this.createPaperNoise(context);
    source.playbackRate.value = 0.92 + Math.random() * 0.16;

    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1350 + Math.random() * 550;
    filter.Q.value = 0.62;

    const gain = context.createGain();
    const now = context.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.018, now + 0.085);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);

    const panner = context.createStereoPanner();
    panner.pan.value = direction === 'forward' ? 0.16 : -0.16;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(context.destination);
    source.start(now);
    source.stop(now + 0.21);
  }

  public setHidden(hidden: boolean): void {
    if (!this.context) return;
    if (hidden && this.context.state === 'running') void this.context.suspend();
  }

  public dispose(): void {
    this.paperNoise = null;
    if (this.context && this.context.state !== 'closed') void this.context.close();
    this.context = null;
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.paperNoise = this.createPaperNoise(this.context);
    return this.context;
  }

  private createPaperNoise(context: AudioContext): AudioBuffer {
    const durationSeconds = 0.22;
    const frameCount = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let previous = 0;

    for (let index = 0; index < samples.length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.72 + white * 0.28;
      const envelope = Math.sin(Math.PI * (index / Math.max(1, samples.length - 1)));
      samples[index] = previous * envelope;
    }

    return buffer;
  }
}
