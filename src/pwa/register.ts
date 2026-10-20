import { registerSW } from 'virtual:pwa-register';

const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export function registerPwa(): void {
  const hadControllerAtStartup = navigator.serviceWorker.controller !== null;
  let reloadScheduled = false;
  let updateTimer: number | null = null;

  const handleControllerChange = (): void => {
    if (!hadControllerAtStartup || reloadScheduled) return;
    reloadScheduled = true;
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

  registerSW({
    immediate: true,
    onRegisteredSW(_serviceWorkerUrl: string, registration: ServiceWorkerRegistration | undefined) {
      if (!registration) return;

      const checkForUpdate = (): void => {
        if (document.hidden) return;
        void registration.update().catch((error: unknown) => {
          console.warn('[PWA] Service worker update check failed.', error);
        });
      };

      checkForUpdate();
      updateTimer = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', checkForUpdate);

      window.addEventListener('pagehide', () => {
        if (updateTimer !== null) window.clearInterval(updateTimer);
        document.removeEventListener('visibilitychange', checkForUpdate);
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      }, { once: true });
    },
    onRegisterError(error: unknown) {
      console.error('[PWA] Service worker registration failed.', error);
    }
  });
}
