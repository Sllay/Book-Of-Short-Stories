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
  readonly presence: BiquadFilterNode;
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
    const moved = Math.abs(motion.deltaProgress) > 0.00065 || speed > 0.035;
    if (!moved && !this.dragVoice) return;

    const voice = this.dragVoice ?? this.startDragVoice(context, motion.direction);
    const now = context.currentTime;

    // Printing-paper friction is comparatively weak at very low frequencies and has
    // useful energy through the broad mid / upper-mid region. Keep the spectrum wide
    // and soft instead of creating narrow noisy bands that sound like sand grains.
    const targetGain = moved
      ? Math.min(0.036, 0.0045 + speed * 0.008 + motion.tension * 0.0035)
      : 0.0001;
    const presenceFrequency = 1500 + speed * 360 + motion.tension * 260;
    const lowpassFrequency = Math.min(7600, 4200 + speed * 820 + motion.tension * 420);
    const presenceGainDb = 2.2 + speed * 0.75 + motion.tension * 0.8;

    voice.frictionGain.gain.cancelScheduledValues(now);
    voice.frictionGain.gain.setTargetAtTime(targetGain, now, moved ? 0.022 : 0.032);
    voice.presence.frequency.setTargetAtTime(presenceFrequency, now, 0.035);
    voice.presence.gain.setTargetAtTime(presenceGainDb, now, 0.035);
    voice.lowpass.frequency.setTargetAtTime(lowpassFrequency, now, 0.04);
    voice.source.playbackRate.setTargetAtTime(0.96 + speed * 0.022, now, 0.04);
    voice.panner.pan.setTargetAtTime(motion.direction === 'forward' ? 0.1 : -0.1, now, 0.025);

    voice.movementAccumulator += Math.abs(motion.deltaProgress);
    if (
      moved
      && voice.movementAccumulator >= voice.nextFlexDistance
      && (motion.tension > 0.12 || speed > 0.8)
    ) {
      voice.movementAccumulator = Math.max(0, voice.movementAccumulator - voice.nextFlexDistance);
      voice.nextFlexDistance = 0.17 + Math.random() * 0.18;
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
    source.playbackRate.value = 0.94 + Math.random() * 0.08;

    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 430;

    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 3900 + Math.random() * 700;
    lowpass.Q.value = 0.35;

    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const now = context.currentTime;
    const duration = 0.105 + Math.random() * 0.045;
    const availableOffset = Math.max(0, buffer.duration - duration - 0.01);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.024 + Math.random() * 0.007, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.007, now + duration * 0.52);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    panner.pan.value = direction === 'forward' ? 0.12 : -0.12;

    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(gain);
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
    source.loopStart = Math.random() * Math.max(0.01, source.buffer.duration * 0.35);
    source.loopEnd = source.buffer.duration;
    source.playbackRate.value = 0.96;

    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 340;
    highpass.Q.value = 0.28;

    const presence = context.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 1650;
    presence.Q.value = 0.58;
    presence.gain.value = 2.5;

    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 4700;
    lowpass.Q.value = 0.32;

    const frictionGain = context.createGain();
    const masterGain = context.createGain();
    const panner = context.createStereoPanner();
    const now = context.currentTime;

    frictionGain.gain.value = 0.0001;
    masterGain.gain.value = 0.88;
    panner.pan.value = direction === 'forward' ? 0.1 : -0.1;

    source.connect(highpass);
    highpass.connect(presence);
    presence.connect(lowpass);
    lowpass.connect(frictionGain);
    frictionGain.connect(masterGain);
    masterGain.connect(panner);
    panner.connect(context.destination);
    source.start(now, Math.random() * Math.max(0.01, source.buffer.duration * 0.55));

    const voice: DragVoice = {
      source,
      highpass,
      presence,
      lowpass,
      frictionGain,
      masterGain,
      panner,
      movementAccumulator: 0,
      nextFlexDistance: 0.18 + Math.random() * 0.17,
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
      voice.masterGain.gain.setTargetAtTime(0.0001, now, 0.016);
      try { voice.source.stop(now + 0.075); } catch { /* source may already be stopped */ }
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
    source.playbackRate.value = 1 + Math.random() * 0.2 + speed * 0.018;

    const bandpass = context.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 1150 + Math.random() * 1100 + tension * 320;
    bandpass.Q.value = 0.48;

    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const now = context.currentTime;
    const duration = 0.028 + Math.random() * 0.032;
    const availableOffset = Math.max(0, buffer.duration - duration - 0.01);
    const peak = Math.min(0.0075, 0.0024 + speed * 0.0008 + tension * 0.002);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    panner.pan.value = (direction === 'forward' ? 0.11 : -0.11) + (Math.random() - 0.5) * 0.05;

    source.connect(bandpass);
    bandpass.connect(gain);
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
    const durationSeconds = 0.92;
    const frameCount = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let soft = 0;
    let slow = 0;

    for (let index = 0; index < samples.length; index += 1) {
      const white = Math.random() * 2 - 1;
      soft = soft * 0.86 + white * 0.14;
      slow = slow * 0.985 + white * 0.015;
      const paperShear = soft - slow * 0.74;
      // Keep only a trace of raw high-frequency noise. A stronger white component
      // makes the continuous rub read as sand/grains instead of a thin sheet sliding.
      samples[index] = paperShear * 0.72 + white * 0.025;
    }

    return buffer;
  }
}
