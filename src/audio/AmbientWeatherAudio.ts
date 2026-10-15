import { subscribeSharedAudioEnabled } from './AudioPreferenceBus';

interface RainVoice {
  readonly source: AudioBufferSourceNode;
  readonly highpass: BiquadFilterNode;
  readonly lowpass: BiquadFilterNode;
  readonly gain: GainNode;
}

export class AmbientWeatherAudio {
  private context: AudioContext | null = null;
  private rainNoise: AudioBuffer | null = null;
  private rainVoice: RainVoice | null = null;
  private enabled = true;
  private rainIntensity = 0;
  private previousLightningPulse = 0;
  private lastThunderAt = 0;
  private nextBirdChirpAt = 0;
  private readonly unsubscribeAudioPreference: () => void;
  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) this.setHidden(true);
  };

  public constructor() {
    this.unsubscribeAudioPreference = subscribeSharedAudioEnabled((enabled) => {
      this.enabled = enabled;
      if (!enabled) {
        this.stopRainVoice();
        if (this.context?.state === 'running') void this.context.suspend();
      }
    });
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  public unlockFromGesture(): void {
    if (!this.enabled || document.hidden) return;
    const context = this.ensureContext();
    if (context.state === 'suspended') {
      void context.resume().then(() => this.applyRainLevel());
    } else {
      this.applyRainLevel();
    }
  }

  public update(rainIntensity: number, lightningPulse: number, birdsActive = false): void {
    this.rainIntensity = clamp01(rainIntensity);
    if (this.context?.state === 'running') this.applyRainLevel();

    const now = Date.now();
    if (birdsActive && this.rainIntensity < 0.14 && this.enabled && now >= this.nextBirdChirpAt) {
      this.playBirdChirp();
      this.nextBirdChirpAt = now + 1500 + Math.random() * 2800;
    } else if (!birdsActive) {
      this.nextBirdChirpAt = 0;
    }

    const lightningStarted = lightningPulse > 0.72 && this.previousLightningPulse <= 0.72;
    this.previousLightningPulse = lightningPulse;
    if (!lightningStarted || !this.enabled) return;
    if (now - this.lastThunderAt < 5500) return;
    this.lastThunderAt = now;
    this.playThunder();
  }

  public setHidden(hidden: boolean): void {
    if (!this.context) return;
    if (hidden) {
      this.stopRainVoice();
      if (this.context.state === 'running') void this.context.suspend();
    }
  }

  public dispose(): void {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.unsubscribeAudioPreference();
    this.stopRainVoice();
    this.rainNoise = null;
    if (this.context && this.context.state !== 'closed') void this.context.close();
    this.context = null;
  }

  private applyRainLevel(): void {
    const context = this.context;
    if (!context || context.state !== 'running' || !this.enabled) return;

    if (this.rainIntensity < 0.025) {
      if (this.rainVoice) {
        const now = context.currentTime;
        this.rainVoice.gain.gain.cancelScheduledValues(now);
        this.rainVoice.gain.gain.setTargetAtTime(0.0001, now, 0.2);
      }
      return;
    }

    const voice = this.rainVoice ?? this.startRainVoice(context);
    const now = context.currentTime;
    // The first version sat below the page foley on phone speakers. Keep it ambient,
    // but give light rain enough body to be heard without headphones.
    const target = 0.011 + this.rainIntensity * 0.056;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(target, now, 0.28);
    voice.highpass.frequency.setTargetAtTime(430 + this.rainIntensity * 210, now, 0.34);
    voice.lowpass.frequency.setTargetAtTime(3100 + this.rainIntensity * 2300, now, 0.34);
  }

  private startRainVoice(context: AudioContext): RainVoice {
    const source = context.createBufferSource();
    source.buffer = this.rainNoise ?? this.createRainNoise(context);
    source.loop = true;
    source.playbackRate.value = 0.94;

    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 500;
    highpass.Q.value = 0.18;

    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 4100;
    lowpass.Q.value = 0.24;

    const gain = context.createGain();
    gain.gain.value = 0.0001;

    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(context.destination);
    source.start();

    const voice = { source, highpass, lowpass, gain };
    this.rainVoice = voice;
    return voice;
  }

  private stopRainVoice(): void {
    const voice = this.rainVoice;
    if (!voice) return;
    try { voice.source.stop(); } catch { /* already stopped */ }
    voice.source.disconnect();
    voice.highpass.disconnect();
    voice.lowpass.disconnect();
    voice.gain.disconnect();
    this.rainVoice = null;
  }

  private playBirdChirp(): void {
    const context = this.context;
    if (!context || context.state !== 'running') return;
    const now = context.currentTime;
    const pan = context.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 0.78;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.012, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    gain.connect(pan);
    pan.connect(context.destination);

    for (let note = 0; note < 2; note += 1) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      const start = now + note * 0.078;
      const base = 1680 + Math.random() * 560 + note * 180;
      oscillator.frequency.setValueAtTime(base, start);
      oscillator.frequency.exponentialRampToValueAtTime(base * (1.28 + Math.random() * 0.12), start + 0.078);
      oscillator.frequency.exponentialRampToValueAtTime(base * 0.92, start + 0.165);
      oscillator.connect(gain);
      oscillator.start(start);
      oscillator.stop(start + 0.185);
    }
  }

  private playThunder(): void {
    const context = this.context;
    if (!context || context.state !== 'running') return;

    const delay = 0.38 + Math.random() * 1.15;
    const startAt = context.currentTime + delay;
    const duration = 3 + Math.random() * 1.5;
    const frames = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let low = 0;
    let medium = 0;

    for (let index = 0; index < frames; index += 1) {
      const progress = index / frames;
      const white = Math.random() * 2 - 1;
      low = low * 0.992 + white * 0.008;
      medium = medium * 0.94 + white * 0.06;
      const crack = progress < 0.055 ? white * (1 - progress / 0.055) * 0.3 : 0;
      const envelope = Math.pow(1 - progress, 2.18);
      samples[index] = Math.tanh((low * 2.15 + medium * 0.64 + crack) * 1.62) * envelope;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 0.87 + Math.random() * 0.1;

    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 680 + Math.random() * 210;
    lowpass.Q.value = 0.45;

    const body = context.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 95 + Math.random() * 45;
    body.Q.value = 0.7;
    body.gain.value = 6;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.082 + Math.random() * 0.028, startAt + 0.09);
    gain.gain.exponentialRampToValueAtTime(0.021, startAt + duration * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    source.connect(lowpass);
    lowpass.connect(body);
    body.connect(gain);
    gain.connect(context.destination);
    source.start(startAt);
    source.stop(startAt + duration + 0.05);
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    this.context = new AudioContext({ latencyHint: 'playback' });
    this.rainNoise = this.createRainNoise(this.context);
    return this.context;
  }

  private createRainNoise(context: AudioContext): AudioBuffer {
    const durationSeconds = 2.1;
    const frames = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let fast = 0;
    let body = 0;

    for (let index = 0; index < frames; index += 1) {
      const white = Math.random() * 2 - 1;
      fast = fast * 0.68 + white * 0.32;
      body = body * 0.91 + white * 0.09;
      const drop = Math.random() > 0.996 ? (Math.random() * 2 - 1) * 0.7 : 0;
      samples[index] = Math.tanh((fast * 0.68 + body * 0.36 + drop) * 1.25) * 0.62;
    }
    return buffer;
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}