import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Book of Short Stories',
        short_name: 'Book Stories',
        description: 'Offline-first physical reading simulator.',
        theme_color: '#17130f',
        background_color: '#17130f',
        display: 'fullscreen',
        orientation: 'landscape',
        start_url: '.',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      },
      workbox: { navigateFallback: 'index.html', cleanupOutdatedCaches: true }
    })
  ],
  build: { target: 'es2022', sourcemap: true }
});
