# Book of Short Stories — Game/Experience Design Document

> **Project type:** Offline-first physical reading simulator for Web / PWA
>
> **Repository:** `Sllay/Book-Of-Short-Stories`
>
> **Primary targets:** Android, iOS/iPadOS and desktop browsers
>
> **Core promise:** Make digital reading feel like handling a real book without sacrificing responsiveness, legibility or offline ownership.

---

## 1. Product vision

**Book of Short Stories** is not intended to be another vertical-scrolling ebook reader. Its purpose is to simulate the feeling of reading a physical book in landscape/fullscreen mode while keeping the convenience of digital files.

The user imports a supported local book file. The application turns that content into a virtual book with two visible pages, a cover, a spine, page thickness, page-turn gestures, paper sound and an optional atmospheric scene around it.

The book must remain readable and responsive even when all decorative systems are disabled. The visual environment is additive; the reading experience is fundamental.

### Product pillars

1. **Reading first** — touch response, page rendering and text clarity always outrank graphics.
2. **Physical illusion, not expensive simulation** — procedural page deformation and graphical tricks instead of cloth physics.
3. **Local ownership** — books, progress, covers, inserted images and scene preferences stay on the device by default.
4. **Offline-first** — after installation/loading of the PWA, the reader should remain usable without internet access.
5. **Progressive complexity** — the same core must scale from a static low-end experience to a highly atmospheric scene.
6. **Non-destructive import** — original user files are never rewritten to add covers, bookmarks or custom inserts.
7. **Modular architecture** — parsers, page rendering, book simulation, environment, audio and storage remain separable.

---

## 2. User experience target

### Primary reading flow

1. Open the PWA/site.
2. Import a local book.
3. The application identifies the source format.
4. The book is parsed or prepared locally.
5. The book opens in landscape/fullscreen-oriented reading mode.
6. Two virtual pages are displayed on a physical-looking book.
7. The user drags the edge/corner of a page.
8. The page bends procedurally and follows the gesture.
9. Releasing it either completes or cancels the page turn.
10. Progress is saved locally.
11. Reopening the application restores the library and last position.

### Long-term experience

The same reader can later provide:

- custom covers;
- custom paper themes;
- inserted image pages;
- animated or static environments;
- ambient audio;
- virtual light sources;
- depth-aware backgrounds;
- export/import of a portable book package;
- accessibility and focus modes.

---

## 3. Supported source strategy

The reader uses a common internal representation instead of making every renderer understand every source format.

```text
TXT / MD / HTML ─┐
EPUB ─────────────┼──> Import Adapter ──> BookDocument ──> PaginationEngine
Future formats ──┘

PDF ──> PDF Adapter ──> fixed source pages
```

### Initial format priorities

**V1**
- internal demo content;
- plain text / TXT as the first real import target.

**V2**
- EPUB;
- PDF;
- Markdown/HTML where useful;
- non-DRM ebook sources that can be parsed safely in-browser.

**Not a project goal:** bypassing DRM or proprietary protection.

---

## 4. Internal document model

Reflowable books are normalized into a `BookDocument`.

Conceptual structure:

```text
BookDocument
├── id
├── metadata
│   ├── title
│   ├── author
│   └── language
├── chapters[]
│   └── blocks[]
│       ├── heading
│       ├── paragraph
│       ├── quote
│       ├── image
│       └── separator
├── media[]
└── styleHints
```

A separate `PageMap` maps logical book locations to the current visual pagination.

Bookmarks and reading progress should prefer stable logical anchors such as:

```text
chapterId + blockId + textOffset
```

instead of storing only a page number. This allows repagination after font, margin or book-size changes without losing the reader's position.

---

## 5. Core rendering model

The project uses a hybrid strategy:

- **HTML/CSS / high-quality 2D rendering** for static readable text;
- **WebGL/Three.js** for the physical book and page-turn deformation;
- **2D/2.5D background systems** for environments;
- **Web Audio** for paper and ambience.

### Page principle

A page is a subdivided mesh with stable UV coordinates.

The visible page content is rendered into a page texture. During a turn, the vertex shader deforms the page mesh while the UV mapping remains stable, causing the text and images to bend naturally with the paper.

No cloth solver is required.

### Physical book illusion

The reader never creates hundreds of page meshes.

A small reusable pool represents:

- current left page;
- current right page;
- turning page;
- previous/next supporting pages;
- optional nearby cached pages.

The rest of the book thickness is represented by lightweight page-block geometry.

---

## 6. Performance doctrine — Reading First

Performance is a product feature.

### Priority order

```text
P0 — Input responsiveness
P1 — Current readable pages
P2 — Page-turn animation
P3 — Next-page preparation
P4 — Page audio feedback
P5 — Book lighting
P6 — Background animation
P7 — Decorative particles/effects
```

Lower priorities may degrade or disable themselves to protect P0–P3.

### Performance target

During direct interaction/page turns:

- target: **60 FPS** where hardware allows;
- target frame budget: **16.67 ms maximum**;
- preferred internal workload: stay materially below the full budget to leave room for browser and OS overhead.

When the book is static, continuous 60 FPS rendering is not required.

### Render scheduler states

```text
STATIC       — render only when something changes
AMBIENT      — environment updates at reduced cadence
INTERACTIVE  — page interaction, target 60 FPS
TRANSITION   — page finishing motion, target 60 FPS
HIDDEN       — pause unnecessary visual/audio work
```

### Performance Governor

A central `PerformanceGovernor` monitors frame timing and gradually changes quality.

It may reduce, in order:

1. decorative particle count;
2. background update rate;
3. expensive shadow quality;
4. depth/parallax quality;
5. render scale;
6. background normal-map response;
7. advanced depth effects.

It must not lower text readability or touch responsiveness first.

Use hysteresis: quality should fall quickly under sustained frame pressure and recover slowly after a stable period.

---

## 7. High-level technical architecture

```text
Application
├── AppShell
├── Library
├── Reader
│   ├── ReadingSession
│   ├── BookRenderer
│   │   ├── BookMesh
│   │   ├── PagePool
│   │   ├── PageCurlController
│   │   ├── PageTextureManager
│   │   └── BookLighting
│   ├── InputController
│   ├── AudioEngine
│   └── EnvironmentRenderer
├── ImportSystem
│   ├── adapters
│   ├── BookDocument
│   ├── PaginationEngine
│   └── PageMap
├── Storage
│   ├── IndexedDB
│   ├── OPFS
│   └── Cache Storage
├── WorkerPool
└── PerformanceGovernor
```

### Main-thread rule

The main thread owns only work required for immediate UI/interaction.

Where practical, workers should handle:

- parsing;
- image resizing;
- thumbnail generation;
- pagination preparation;
- expensive preprocessing;
- background asset preparation.

**Rule:** a parser must never be allowed to make page dragging feel delayed.

---

# 8. DEVELOPMENT ROADMAP

The project is divided into **3 versions**. Each version is divided into **4 production parts**, for a total of **12 major development blocks**.

A part is complete only when its acceptance criteria are met. Features belonging to later versions should not be pulled forward unless they are required to avoid an architectural dead end.

---

# VERSION 1 — FOUNDATION / PHYSICAL READING CORE

## Goal

Prove the central experience: a lightweight virtual book can display readable content and produce a convincing, responsive page turn on mobile and desktop.

V1 is not meant to be the final reader. It is the engine foundation on which everything else depends.

---

## V1 — Part 1/4: Project skeleton and runtime foundation

### Objectives

Create a clean application skeleton and the systems that every later feature will depend on.

### Work

- TypeScript project bootstrap;
- Vite build/dev environment;
- PWA/application shell foundation;
- Three.js renderer abstraction;
- responsive fullscreen/landscape reader canvas;
- application state model;
- input abstraction for pointer/touch/mouse;
- render scheduler states;
- initial PerformanceGovernor interface;
- basic debug overlay for FPS/frame time/render state;
- worker messaging foundation;
- local settings skeleton.

### Required modules

```text
src/core/
src/render/
src/input/
src/performance/
src/storage/
src/workers/
```

### Acceptance criteria

- project opens on mobile and desktop browsers;
- viewport resizes correctly;
- touch and mouse coordinates map consistently to reader space;
- renderer can enter/leave STATIC and INTERACTIVE states;
- debug overlay reports useful runtime timing;
- no book-specific logic is tightly coupled to application startup.

### Explicitly out of scope

- EPUB/PDF import;
- final library UI;
- advanced lighting;
- animated scenes.

---

## V1 — Part 2/4: Book mesh and procedural page curl

### Objectives

Build the physical interaction that defines the product.

### Work

- low-complexity book mesh;
- left/right cover placeholders;
- spine placeholder;
- fake page blocks for thickness;
- reusable page mesh pool;
- UV mapping for front/back page surfaces;
- procedural page curl shader;
- drag zone detection;
- page corner/edge grab;
- drag-follow behavior;
- cancel threshold;
- complete-turn threshold;
- spring/easing settle animation;
- left-to-right and right-to-left structural support where practical;
- simple local page shadow/fold darkening;
- shader prewarming/compilation strategy.

### Page curl model

The first implementation should use a deterministic visual model such as:

```text
cylindrical curl
+ directional fold
+ falloff
+ secondary bend
+ release easing
```

Do not introduce cloth physics.

### Acceptance criteria

- user can grab and move a page directly with touch;
- visible content remains attached to the page through deformation;
- releasing early cancels naturally;
- releasing beyond threshold completes naturally;
- interaction feels responsive at target devices;
- page turn does not create avoidable allocation spikes every frame;
- only a small fixed page mesh pool exists regardless of logical book size.

---

## V1 — Part 3/4: Text pagination and page texture pipeline

### Objectives

Turn real text into stable book pages and connect it to the physical renderer.

### Work

- initial `BookDocument` data model;
- TXT importer;
- basic paragraph normalization;
- typography configuration;
- page layout area calculation;
- pagination engine;
- stable logical anchors;
- `PageMap`;
- page texture generation;
- active/next/previous page cache;
- asynchronous preparation of nearby pages;
- font-loading safeguards;
- resize/repagination handling;
- restore logical reading position after repagination.

### Initial reader options

- font size;
- line height;
- margins;
- paper/background tone;
- basic font choice.

### Acceptance criteria

- a TXT book can be imported locally;
- content is split into consistent visual pages;
- page turns show the correct next/previous content;
- changing typography triggers safe repagination;
- current reading location survives repagination;
- no need to rasterize the entire book in advance.

---

## V1 — Part 4/4: Offline session, local persistence and baseline polish

### Objectives

Turn the engine prototype into a usable offline reading prototype.

### Work

- service worker/PWA cache;
- IndexedDB metadata storage;
- OPFS/file storage strategy where supported;
- recent-book state;
- reading progress persistence;
- baseline bookmarks;
- paper page-turn SFX;
- minimal AudioEngine;
- static background image;
- simple single book light;
- focus mode;
- reduced-motion behavior;
- memory/resource disposal;
- V1 performance pass;
- mobile orientation/gesture polish;
- error boundaries and safe recovery.

### V1 exit criteria

V1 is complete when a user can:

1. install/open the PWA;
2. import a TXT book;
3. read it offline;
4. turn pages by dragging them;
5. hear basic paper feedback;
6. close and reopen the reader;
7. continue from the previous position;
8. do all of the above smoothly on a reasonable mobile device.

At this point the **Physical Reading Core is proven**.

---

# VERSION 2 — REAL BOOK EXPERIENCE

## Goal

Transform the V1 engine into a useful everyday ebook reader that handles common book formats and makes the virtual object feel materially like a real book.

---

## V2 — Part 1/4: Production import pipeline

### Objectives

Expand from TXT to real ebook/document workflows while keeping adapters modular.

### Work

- EPUB adapter;
- PDF adapter using a browser-compatible PDF rendering pipeline;
- Markdown/HTML adapter where practical;
- metadata extraction;
- chapter/TOC extraction;
- embedded image extraction;
- fixed-layout vs reflowable source distinction;
- import validation;
- unsupported/protected-format messaging;
- progressive preparation instead of whole-book blocking;
- background workers for expensive parsing where practical.

### Acceptance criteria

- EPUB chapter structure is preserved;
- PDF pages map predictably to virtual sheets;
- large books do not require full upfront rasterization;
- import failures are understandable and recoverable;
- adapters do not contain renderer-specific page-turn logic.

---

## V2 — Part 2/4: Library and portable local book package

### Objectives

Create a real local library while keeping user ownership and portability.

### Work

- library screen;
- cover thumbnails;
- title/author metadata;
- last-read position;
- reading status;
- delete/import controls;
- storage quota awareness;
- cache eviction rules;
- export/import package format;
- versioned `manifest.json`;
- local original source preservation where appropriate;
- bookmarks and reader configuration export.

### Portable package concept

```text
*.book.zip
├── manifest.json
├── source/
├── cover/
├── inserts/
├── background/
├── audio/
├── config/
└── state/
```

The package format must be versioned so future releases can migrate old exports.

### Acceptance criteria

- user can build and retain a local library;
- deleting one book does not corrupt others;
- an exported package can be re-imported and reconstruct its supported customizations;
- the original source remains logically separate from reader customization data.

---

## V2 — Part 3/4: Physical book material system

### Objectives

Make the object itself feel substantially more like a real book without sacrificing performance.

### Work

- cover front/back textures;
- spine presentation;
- configurable cover image;
- page block thickness based on logical progress/page count;
- subtle paper material response;
- front/back page differentiation;
- controlled translucency illusion where affordable;
- fold shadow shader refinement;
- book-on-table contact shadow;
- simple material presets:
  - paper;
  - aged paper;
  - cloth cover;
  - leather-like cover;
- book opening/closing animation;
- cover/page sound set;
- optional page-edge coloration.

### Acceptance criteria

- current position visibly affects left/right page-stack thickness;
- cover, spine and page blocks read as one coherent object;
- visual improvements remain compatible with PerformanceGovernor degradation;
- no need for hundreds of physical page meshes.

---

## V2 — Part 4/4: Reader customization and inserted content

### Objectives

Allow the reader to personalize the physical book without modifying the source ebook.

### Work

- custom cover selection;
- book title/author presentation options;
- theme/paper presets;
- inserted image pages;
- logical insertion anchors;
- optional blank separator pages;
- bookmarks UI;
- chapter navigation;
- reading progress UI that can hide automatically;
- text search where source representation permits;
- reader settings profile;
- import/export of customizations.

### Insert model

Custom pages attach to logical anchors rather than destructive source edits.

Example:

```text
insert image page
after chapter_04 / block_027
```

### V2 exit criteria

V2 is complete when the application can credibly function as a **real daily-use local ebook reader**, not merely a technical demonstration.

A user should be able to import EPUB/PDF/TXT books, organize them, customize the virtual copy, read offline, preserve progress and export the customized package.

---

# VERSION 3 — IMMERSIVE READING ENVIRONMENT

## Goal

Push the visual and sensory experience substantially further while maintaining the same Reading First guarantees.

V3 is where the product becomes not only a book simulator but a configurable reading atmosphere.

---

## V3 — Part 1/4: Layered and depth-aware backgrounds

### Objectives

Create convincing depth without requiring a complete 3D room.

### Background modes

```text
STATIC_IMAGE
LAYERED_PARALLAX
DEPTH_PARALLAX
ADVANCED_2D5D
```

### Work

- background scene manifest;
- layered sprite backgrounds;
- subtle pointer/device parallax;
- optional depth map;
- depth-based UV displacement;
- optional normal map;
- foreground layers;
- independent background resolution control;
- safe scene fallback to static image;
- environment quality levels.

### Acceptance criteria

- one environment can have visible depth while remaining mostly image-based;
- disabling depth returns instantly to a valid static scene;
- book input remains unaffected by background processing;
- background assets obey memory limits and device-based resolution caps.

---

## V3 — Part 2/4: Unified 2D/3D lighting bridge

### Objectives

Make the book and image-based environment appear to share the same light sources.

### Work

- `LightController`;
- book 3D key light;
- environment 2D/2.5D light response;
- ambient light/tint;
- normal-map lighting for supported scenes;
- scene light anchors such as:
  - candle;
  - lamp;
  - window;
  - fireplace;
  - moonlight;
- smooth low-cost flicker/noise system;
- shared time signal so sprite glow, book light and background response remain synchronized;
- fake/glow lighting for secondary sources;
- adaptive shadow quality.

### Principle

A scene may visually contain many lights while only one or very few expensive lights affect the physical book.

### Acceptance criteria

- a candle/lamp source appears to affect both the background and book coherently;
- advanced background lighting can be disabled independently;
- no requirement for expensive multi-light shadow rendering.

---

## V3 — Part 3/4: Animated ambience and spatial soundscape

### Objectives

Create living environments without turning the reader into a game scene.

### Work

- environment animation scheduler;
- low-rate ambient animation independent from 60 FPS page interaction;
- instanced/shader particles;
- rain;
- dust;
- subtle smoke;
- flame/fireplace animation;
- animated foreground elements;
- optional optimized video background mode;
- ambient audio layers;
- scene one-shots;
- page interaction sound refinement;
- volume mixer;
- focus mode integration;
- auto-pause while hidden.

### Rules

- decorative animation may run at 15/24/30 FPS;
- page interaction may independently target 60 FPS;
- no DOM element per particle;
- ambience must stop or degrade before page response suffers.

### Acceptance criteria

- atmosphere feels alive without requiring a 60 FPS full-scene render loop;
- hidden/inactive tabs stop unnecessary work;
- focus mode can reduce the scene to a calm, near-static reader instantly.

---

## V3 — Part 4/4: Advanced polish, automatic quality and release hardening

### Objectives

Turn all previous systems into a stable adaptive product.

### Work

- mature PerformanceGovernor;
- render-scale adaptation;
- texture-resolution tiers;
- environment quality tiers;
- GPU/memory-safe cache policies;
- KTX2/Basis pipeline for bundled graphical assets where appropriate;
- shader prewarming;
- resource lifetime auditing;
- long-session leak testing;
- low-memory recovery;
- battery-conscious ambient modes;
- accessibility audit;
- reduced motion;
- keyboard/desktop support;
- touch ergonomics audit;
- loading/error-state polish;
- import corruption recovery;
- package migration tests;
- browser compatibility pass;
- install/offline PWA hardening.

### Automatic quality philosophy

Default mode: **Auto**.

Suggested internal bands:

```text
ULTRA
HIGH
BALANCED
LOW
SAFE
```

The user can override presentation preferences, but the engine retains emergency safeguards necessary to keep interaction usable.

### V3 exit criteria

V3 is complete when:

- advanced environments can look rich on capable devices;
- low-end devices automatically retain the fundamental reader experience;
- the same book/session survives quality changes;
- disabling every decorative feature still leaves a complete, pleasant reader;
- long reading sessions do not progressively degrade from leaks or unchecked caches.

---

# 9. Version summary

| Version | Product state | Main outcome |
|---|---|---|
| **V1** | Physical Reading Core | Prove page curl, pagination, offline state and smooth reading |
| **V2** | Real Book Reader | EPUB/PDF library, book materials, customization and portable packages |
| **V3** | Immersive Reader | Depth environments, unified lighting, ambience and adaptive graphical polish |

Each version contains exactly four major production parts:

```text
V1.1  Runtime Foundation
V1.2  Book Mesh + Page Curl
V1.3  Pagination + Page Pipeline
V1.4  Offline Prototype

V2.1  Production Importers
V2.2  Library + Portable Package
V2.3  Physical Materials
V2.4  Customization + Inserts

V3.1  Depth Backgrounds
V3.2  Lighting Bridge
V3.3  Animated Ambience + Audio
V3.4  Adaptive Quality + Release Hardening
```

---

# 10. Proposed repository structure

The exact layout may evolve, but responsibilities should remain separated.

```text
Book-Of-Short-Stories/
├── README.md
├── GDD.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   ├── icons/
│   └── default-assets/
├── src/
│   ├── app/
│   ├── core/
│   ├── reader/
│   ├── render/
│   │   ├── book/
│   │   ├── pages/
│   │   ├── shaders/
│   │   ├── lighting/
│   │   └── environment/
│   ├── input/
│   ├── import/
│   │   ├── adapters/
│   │   ├── model/
│   │   └── pagination/
│   ├── library/
│   ├── storage/
│   ├── audio/
│   ├── performance/
│   ├── workers/
│   ├── ui/
│   └── utils/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
└── docs/
    ├── architecture/
    ├── formats/
    └── performance/
```

---

# 11. Development rules

## Modularity

Repeated behavior must be centralized rather than duplicated.

Examples:

- format-specific parsing lives in adapters;
- page state lives outside visual meshes;
- environment effects consume shared scene data;
- all quality decisions pass through the PerformanceGovernor;
- all persistent keys/formats are versioned.

## Avoid premature abstraction

V1 should establish clear boundaries but not create a giant framework for hypothetical future features.

Prefer:

```text
small interfaces + replaceable implementations
```

over:

```text
one universal mega-system
```

## No silent expensive work

Any potentially expensive operation must have one of these strategies:

- worker execution;
- incremental chunking;
- progressive preparation;
- explicit caching;
- lazy loading.

## No decorative dependency

Reader functionality must never depend on:

- depth maps;
- particles;
- animated backgrounds;
- dynamic environmental lighting;
- internet access.

---

# 12. Testing strategy

## Functional tests

- pagination stability;
- page order;
- forward/back page turns;
- save/restore progress;
- repagination anchor retention;
- import/export package migration;
- cache eviction safety;
- corrupt-file handling.

## Interaction tests

- slow drag;
- fast flick;
- cancel turn;
- complete turn;
- reverse direction;
- repeated fast page turns;
- multitouch rejection/handling;
- orientation change.

## Performance tests

Record at least:

- average frame time;
- worst frame spikes during page turn;
- page texture preparation time;
- import preparation time;
- memory usage trends where observable;
- active texture/page cache counts;
- long-session resource stability.

## Test tiers

```text
LOW-END MOBILE
MID MOBILE
HIGH MOBILE
DESKTOP
```

The project should be designed so the lowest tier loses optional effects, not reader functionality.

---

# 13. Storage and privacy model

Default product behavior:

- no account required;
- no cloud required;
- no book upload required;
- no server-side book processing required;
- local storage by default;
- export only when explicitly requested by the user.

The application should clearly communicate when browser/device storage limits may affect a large local library.

---

# 14. Accessibility and comfort

The experience should eventually include:

- reduced motion support;
- focus mode;
- font sizing;
- line height;
- margin adjustment;
- high-contrast reading themes;
- keyboard navigation on desktop;
- screen-reader-compatible library/navigation where practical;
- option to disable ambience independently from page-turn feedback;
- optional static page transition for users who do not want curling motion.

---

# 15. Non-goals

The following are not core goals of this project:

- DRM bypass;
- hosting or redistributing copyrighted books;
- social ebook storefront;
- cloud account platform;
- full 3D room simulation;
- physically accurate cloth/paper physics;
- game-engine-scale post-processing;
- mandatory online AI services.

---

# 16. Definition of project success

The project succeeds if a user can take an ordinary digital book and feel that reading it is calmer, more tactile and more atmospheric than scrolling through a standard reader — while the application remains fast enough that the visual simulation never becomes an obstacle to reading.

The final hierarchy remains:

```text
READING
  > INTERACTION
    > PHYSICAL BOOK ILLUSION
      > LIGHTING
        > ENVIRONMENT
          > DECORATION
```

If an effect threatens the layer above it, the effect is reduced or removed.

---

# 17. Immediate next milestone

Development begins with **V1 — Part 1/4: Project skeleton and runtime foundation**.

The first implementation milestone should end with:

- a working TypeScript/Vite project;
- PWA-ready shell;
- Three.js canvas;
- responsive landscape reader space;
- touch/mouse input normalization;
- render scheduler;
- performance debug overlay;
- basic PerformanceGovernor contract;
- clean module boundaries ready for the first procedural page mesh.

Only after that foundation is stable should **V1 — Part 2/4 Page Curl** begin.
