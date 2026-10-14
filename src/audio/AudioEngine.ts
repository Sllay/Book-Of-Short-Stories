import { setSharedAudioEnabled } from './AudioPreferenceBus';

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
  readonly highpass: BiquadFilterNode;
  readonly body: BiquadFilterNode;
  readonly lowpass: BiquadFilterNode;
  readonly frictionGain: GainNode;
  readonly masterGain: GainNode;
  readonly panner: StereoPannerNode;
  movementAccumulator: number;
  nextFlexDistance: number;
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
    setSharedAudioEnabled(enabled);
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
    const movement = Math.abs(motion.deltaProgress);
    const moved = movement > 0.0007 || speed > 0.045;
    if (!moved && !this.dragVoice) return;

    const voice = this.dragVoice ?? this.startDragVoice(context, motion.direction);
    const now = context.currentTime;
    const targetGain = moved
      ? Math.min(0.026, 0.0032 + speed * 0.0054 + motion.tension * 0.0025)
      : 0.0001;
    const bodyFrequency = 820 + speed * 145 + motion.tension * 120;
    const lowpassFrequency = 2450 + speed * 360 + motion.tension * 220;

    voice.frictionGain.gain.cancelScheduledValues(now);
    voice.frictionGain.gain.setTargetAtTime(targetGain, now, moved ? 0.017 : 0.026);
    voice.body.frequency.setTargetAtTime(bodyFrequency, now, 0.035);
    voice.body.gain.setTargetAtTime(2.2 + speed * 0.35, now, 0.04);
    voice.lowpass.frequency.setTargetAtTime(lowpassFrequency, now, 0.045);
    voice.source.playbackRate.setTargetAtTime(0.94 + speed * 0.014, now, 0.045);
    voice.panner.pan.setTargetAtTime(motion.direction === 'forward' ? 0.075 : -0.075, now, 0.03);

    voice.movementAccumulator += movement;
    if (
      moved
      && voice.movementAccumulator >= voice.nextFlexDistance
      && motion.tension > 0.2
      && speed > 0.45
    ) {
      voice.movementAccumulator = Math.max(0, voice.movementAccumulator - voice.nextFlexDistance);
      voice.nextFlexDistance = 0.23 + Math.random() * 0.22;
      this.playFlexPulse(context, motion.direction, speed, motion.tension);
    }
  }

  public playPageSettle(direction: PaperTurnDirection): void {
    if (!this.enabled) return;
    const context = this.ensureContext();
    if (context.state !== 'running') return;

    const source = context.createBufferSource();
    const buffer = this.paperNoise ?? this.createPaperNoise(context);
    source.buffer = buffer;
    source.playbackRate.value = 0.86 + Math.random() * 0.07;

    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 250;
    highpass.Q.value = 0.22;

    const body = context.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 760 + Math.random() * 180;
    body.Q.value = 0.62;
    body.gain.value = 2.8;

    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2100 + Math.random() * 320;
    lowpass.Q.value = 0.28;

    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const now = context.currentTime;
    const duration = 0.15 + Math.random() * 0.045;
    const availableOffset = Math.max(0, buffer.duration - duration - 0.01);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.013 + Math.random() * 0.0035, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.005, now + duration * 0.58);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    panner.pan.value = direction === 'forward' ? 0.08 : -0.08;

    source.connect(highpass);
    highpass.connect(body);
    body.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(panner);
    panner.connect(context.destination);
    source.start(now, Math.random() * availableOffset, duration);
    source.stop(now + duration + 0.02);
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
    source.loopStart = Math.random() * Math.max(0.01, source.buffer.duration * 0.28);
    source.loopEnd = source.buffer.duration;
    source.playbackRate.value = 0.94;

    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 270;
    highpass.Q.value = 0.24;

    const body = context.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 850;
    body.Q.value = 0.7;
    body.gain.value = 2.4;

    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2600;
    lowpass.Q.value = 0.25;

    const frictionGain = context.createGain();
    const masterGain = context.createGain();
    const panner = context.createStereoPanner();
    const now = context.currentTime;

    frictionGain.gain.value = 0.0001;
    masterGain.gain.value = 0.82;
    panner.pan.value = direction === 'forward' ? 0.075 : -0.075;

    source.connect(highpass);
    highpass.connect(body);
    body.connect(lowpass);
    lowpass.connect(frictionGain);
    frictionGain.connect(masterGain);
    masterGain.connect(panner);
    panner.connect(context.destination);
    source.start(now, Math.random() * Math.max(0.01, source.buffer.duration * 0.5));

    const voice: DragVoice = {
      source,
      highpass,
      body,
      lowpass,
      frictionGain,
      masterGain,
      panner,
      movementAccumulator: 0,
      nextFlexDistance: 0.24 + Math.random() * 0.2,
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
      voice.masterGain.gain.setTargetAtTime(0.0001, now, 0.012);
      try { voice.source.stop(now + 0.055); } catch { /* source may already be stopped */ }
    }
    this.dragVoice = null;
  }

  private playFlexPulse(
    context: AudioContext,
    direction: PaperTurnDirection,
    speed: number,
    tension: number
  ): void {
    const source = context.createBufferSource();
    const buffer = this.paperNoise ?? this.createPaperNoise(context);
    source.buffer = buffer;
    source.playbackRate.value = 0.93 + Math.random() * 0.12 + speed * 0.008;

    const bandpass = context.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 720 + Math.random() * 540 + tension * 180;
    bandpass.Q.value = 0.58;

    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const now = context.currentTime;
    const duration = 0.04 + Math.random() * 0.035;
    const availableOffset = Math.max(0, buffer.duration - duration - 0.01);
    const peak = Math.min(0.0045, 0.0017 + speed * 0.00045 + tension * 0.0013);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    panner.pan.value = (direction === 'forward' ? 0.08 : -0.08) + (Math.random() - 0.5) * 0.035;

    source.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(panner);
    panner.connect(context.destination);
    source.start(now, Math.random() * availableOffset, duration);
    source.stop(now + duration + 0.012);
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.paperNoise = this.createPaperNoise(this.context);
    return this.context;
  }

  private createPaperNoise(context: AudioContext): AudioBuffer {
    const durationSeconds = 1.05;
    const frameCount = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let fast = 0;
    let medium = 0;
    let slow = 0;

    for (let index = 0; index < samples.length; index += 1) {
      const white = Math.random() * 2 - 1;
      fast = fast * 0.82 + white * 0.18;
      medium = medium * 0.94 + white * 0.06;
      slow = slow * 0.992 + white * 0.008;

      const sheetBody = fast * 0.52 + medium * 0.42 - slow * 0.34;
      const compressed = Math.tanh(sheetBody * 1.55);
      samples[index] = compressed * 0.72;
    }

    return buffer;
  }
}
