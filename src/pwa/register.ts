import { registerSW } from 'virtual:pwa-register';

export function registerPwa(): void {
  registerSW({
    immediate: true,
    onRegisterError(error: unknown) { console.error('[PWA] Service worker registration failed.', error); }
  });
}
