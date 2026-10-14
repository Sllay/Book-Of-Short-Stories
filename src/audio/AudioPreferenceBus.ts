type AudioPreferenceListener = (enabled: boolean) => void;

let sharedAudioEnabled = true;
const listeners = new Set<AudioPreferenceListener>();

export function setSharedAudioEnabled(enabled: boolean): void {
  if (sharedAudioEnabled === enabled) return;
  sharedAudioEnabled = enabled;
  for (const listener of listeners) listener(enabled);
}

export function subscribeSharedAudioEnabled(listener: AudioPreferenceListener): () => void {
  listeners.add(listener);
  listener(sharedAudioEnabled);
  return () => listeners.delete(listener);
}
