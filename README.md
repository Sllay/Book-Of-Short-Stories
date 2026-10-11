# Book of Short Stories

Offline-first physical reading simulator for the web. The project aims to make digital reading feel like handling a physical book while keeping interaction, readability and local ownership ahead of decorative graphics.

## Current milestone

**V1.1 — Project Skeleton and Runtime Foundation**

Implemented foundation:

- Vite + TypeScript application shell;
- Three.js WebGL renderer;
- fullscreen / landscape-friendly canvas;
- unified Pointer Events input for touch, pen and mouse;
- render scheduler with `static`, `ambient`, `interactive` and `hidden` modes;
- frame metrics and adaptive `PerformanceGovernor` foundation;
- controlled device pixel ratio / render scale;
- PWA manifest and generated offline service worker;
- page visibility handling;
- CI build validation.

The cream rectangle rendered in V1.1 is only a diagnostic surface used to validate input, rendering, resizing and adaptive quality. It is **not** the final book or PageCurl implementation.

## Requirements

- Node.js `>=20.19.0`
- npm

## Run locally

```bash
npm install
npm run dev
```

For the runtime debug HUD open the local URL with `?debug=1`.

## Production build

```bash
npm run build
npm run preview
```

## Project principles

1. Reading responsiveness outranks graphics.
2. The main thread must stay free for touch, rendering and the current page.
3. Decorative systems must be optional and degradable.
4. The renderer must not run continuously when the scene is static.
5. Book parsers and heavy preprocessing will move to workers as later milestones are implemented.

## Runtime modules

```text
src/
├── core/          App lifecycle and shared types
├── input/         Pointer/touch/mouse normalization
├── performance/   Frame metrics and adaptive quality
├── pwa/           Service worker registration
├── render/        Three.js renderer
├── runtime/       Render scheduling
└── ui/            Debug/developer UI
```

See [`GDD.md`](./GDD.md) for the complete product and development roadmap.
