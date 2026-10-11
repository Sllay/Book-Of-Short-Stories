export type PaperTurnDirection = 'forward' | 'backward';

export interface PageFoleyMotion {
  readonly direction: PaperTurnDirection;
  readonly velocity: number;
  readonly deltaProgress: number;
  readonly tension: number;
  readonly active: boolean;
}

interface DragVoice {
  readonly source: AudioBufferSourceNode;
  readonly frictionFilter: BiquadFilterNode;
  readonly frictionGain: GainNode;
  readonly fiberFilter: BiquadFilterNode;
  readonly fiberGain: GainNode;
  readonly masterGain: GainNode;
  readonly panner: StereoPannerNode;
  movementAccumulator: number;
  nextFiberDistance: number;
  stopped: boolean;
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private paperNoise: AudioBuffer | null = null;
  private dragVoice: DragVoice | null = null;
  private enabled = true;

  public get isEnabled(): boolean { return this.enabled; }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopDragVoice();
      if (this.context?.state === 'running') void this.context.suspend();
    }
  }

  public unlockFromGesture(): void {
    if (!this.enabled) return;
    const context = this.ensureContext();
    if (context.state === 'suspended') void context.resume();
  }

  public updatePageDrag(motion: PageFoleyMotion): void {
    if (!this.enabled || !motion.active) {
      this.stopDragVoice();
      return;
    }

    const context = this.context;
    if (!context || context.state !== 'running') return;

    const speed = Math.min(4, Math.abs(motion.velocity));
    const moved = Math.abs(motion.deltaProgress) > 0.0008 || speed > 0.025;
    if (!moved && !this.dragVoice) return;

    const voice = this.dragVoice ?? this.startDragVoice(context, motion.direction);
    const now = context.currentTime;
    const targetFriction = moved ? Math.min(0.045, 0.006 + speed * 0.009 + motion.tension * 0.008) : 0.0001;
    const targetFiber = moved ? Math.min(0.018, 0.0018 + speed * 0.0034 + motion.tension * 0.003) : 0.0001;
    const frictionFrequency = 720 + speed * 510 + motion.tension * 380;
    const fiberFrequency = 2600 + speed * 620 + motion.tension * 520;

    voice.frictionGain.gain.cancelScheduledValues(now);
    voice.frictionGain.gain.setTargetAtTime(targetFriction, now, moved ? 0.018 : 0.026);
    voice.fiberGain.gain.cancelScheduledValues(now);
    voice.fiberGain.gain.setTargetAtTime(targetFiber, now, moved ? 0.015 : 0.022);
    voice.frictionFilter.frequency.setTargetAtTime(frictionFrequency, now, 0.025);
    voice.fiberFilter.frequency.setTargetAtTime(fiberFrequency, now, 0.02);
    voice.source.playbackRate.setTargetAtTime(0.88 + speed * 0.045, now, 0.025);
    voice.panner.pan.setTargetAtTime(motion.direction === 'forward' ? 0.12 : -0.12, now, 0.02);

    voice.movementAccumulator += Math.abs(motion.deltaProgress);
    if (voice.movementAccumulator >= voice.nextFiberDistance && moved) {
      voice.movementAccumulator = Math.max(0, voice.movementAccumulator - voice.nextFiberDistance);
      voice.nextFiberDistance = 0.065 + Math.random() * 0.105;
      this.playFiberTick(context, motion.direction, speed, motion.tension);
    }
  }

  public playPageSettle(direction: PaperTurnDirection): void {
    if (!this.enabled) return;
    const context = this.ensureContext();
    if (context.state !== 'running') return;

    const source = context.createBufferSource();
    const buffer = this.paperNoise ?? this.createPaperNoise(context);
    source.buffer = buffer;
    source.playbackRate.value = 0.82 + Math.random() * 0.12;

    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 820 + Math.random() * 420;
    filter.Q.value = 0.52;

    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const now = context.currentTime;
    const duration = 0.14 + Math.random() * 0.055;
    const availableOffset = Math.max(0, buffer.duration - duration - 0.01);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.034 + Math.random() * 0.009, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.011, now + duration * 0.52);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    panner.pan.value = direction === 'forward' ? 0.15 : -0.15;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(context.destination);
    source.start(now, Math.random() * availableOffset, duration);
    source.stop(now + duration + 0.015);
  }

  public setHidden(hidden: boolean): void {
    if (!this.context) return;
    if (hidden) {
      this.stopDragVoice();
      if (this.context.state === 'running') void this.context.suspend();
    }
  }

  public dispose(): void {
    this.stopDragVoice();
    this.paperNoise = null;
    if (this.context && this.context.state !== 'closed') void this.context.close();
    this.context = null;
  }

  private startDragVoice(context: AudioContext, direction: PaperTurnDirection): DragVoice {
    this.stopDragVoice();

    const source = context.createBufferSource();
    source.buffer = this.paperNoise ?? this.createPaperNoise(context);
    source.loop = true;
    source.loopStart = Math.random() * Math.max(0.01, source.buffer.duration * 0.45);
    source.loopEnd = source.buffer.duration;
    source.playbackRate.value = 0.9;

    const frictionFilter = context.createBiquadFilter();
    frictionFilter.type = 'bandpass';
    frictionFilter.frequency.value = 900;
    frictionFilter.Q.value = 0.55;

    const fiberFilter = context.createBiquadFilter();
    fiberFilter.type = 'bandpass';
    fiberFilter.frequency.value = 3000;
    fiberFilter.Q.value = 0.82;

    const frictionGain = context.createGain();
    const fiberGain = context.createGain();
    const masterGain = context.createGain();
    const panner = context.createStereoPanner();
    const now = context.currentTime;

    frictionGain.gain.value = 0.0001;
    fiberGain.gain.value = 0.0001;
    masterGain.gain.value = 0.92;
    panner.pan.value = direction === 'forward' ? 0.12 : -0.12;

    source.connect(frictionFilter);
    source.connect(fiberFilter);
    frictionFilter.connect(frictionGain);
    fiberFilter.connect(fiberGain);
    frictionGain.connect(masterGain);
    fiberGain.connect(masterGain);
    masterGain.connect(panner);
    panner.connect(context.destination);
    source.start(now, Math.random() * Math.max(0.01, source.buffer.duration * 0.7));

    const voice: DragVoice = {
      source,
      frictionFilter,
      frictionGain,
      fiberFilter,
      fiberGain,
      masterGain,
      panner,
      movementAccumulator: 0,
      nextFiberDistance: 0.07 + Math.random() * 0.09,
      stopped: false
    };
    this.dragVoice = voice;
    return voice;
  }

  private stopDragVoice(): void {
    const voice = this.dragVoice;
    if (!voice || voice.stopped) {
      this.dragVoice = null;
      return;
    }

    voice.stopped = true;
    const context = this.context;
    if (context && context.state !== 'closed') {
      const now = context.currentTime;
      voice.masterGain.gain.cancelScheduledValues(now);
      voice.masterGain.gain.setTargetAtTime(0.0001, now, 0.018);
      try { voice.source.stop(now + 0.085); } catch { /* source may already be stopped */ }
    }
    this.dragVoice = null;
  }

  private playFiberTick(context: AudioContext, direction: PaperTurnDirection, speed: number, tension: number): void {
    const source = context.createBufferSource();
    const buffer = this.paperNoise ?? this.createPaperNoise(context);
    source.buffer = buffer;
    source.playbackRate.value = 1.15 + Math.random() * 0.55 + speed * 0.06;

    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2100 + Math.random() * 1500;

    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const now = context.currentTime;
    const duration = 0.018 + Math.random() * 0.025;
    const availableOffset = Math.max(0, buffer.duration - duration - 0.01);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.min(0.018, 0.005 + speed * 0.002 + tension * 0.004), now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    panner.pan.value = (direction === 'forward' ? 0.16 : -0.16) + (Math.random() - 0.5) * 0.08;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(context.destination);
    source.start(now, Math.random() * availableOffset, duration);
    source.stop(now + duration + 0.01);
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.paperNoise = this.createPaperNoise(this.context);
    return this.context;
  }

  private createPaperNoise(context: AudioContext): AudioBuffer {
    const durationSeconds = 0.82;
    const frameCount = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let soft = 0;
    let slow = 0;

    for (let index = 0; index < samples.length; index += 1) {
      const white = Math.random() * 2 - 1;
      soft = soft * 0.78 + white * 0.22;
      slow = slow * 0.94 + white * 0.06;
      const dryFiber = white - soft;
      const paperBody = soft - slow * 0.35;
      samples[index] = paperBody * 0.72 + dryFiber * 0.18 + slow * 0.12;
    }

    return buffer;
  }
}
