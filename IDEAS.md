# txtfx — Feature Ideas & Roadmap

Legend:
- [x] shipped
- [-] partial / groundwork exists
- [ ] not started

## Current State
- [x] 12 ASCII effects with color, glow, and per-effect controls
- [x] Timeline with playback controls, scrubbing, and draggable effect bars
- [x] Mask painting with foreground/background regions
- [x] Export: scene JSON, embed snippet, standalone HTML
- [x] Auto-save, undo/redo, effect presets
- [-] Light/dark mode, responsive layout
- [x] Short-link sharing via R2 + database
- [x] Open/save scene files (`.txtfx` / `.json`)

Notes:
- Theme toggle exists; the responsive/mobile layout still needs cleanup.

---

## Near-Term Features

### Sharing & Backend
- [x] Short link sharing via database (replace base64 URL hack)
- [x] API routes: `POST /api/scenes` (create), `GET /api/scenes/[id]` (load)
- [-] Legacy base64/hash sharing kept as a fallback compatibility path
- [ ] Scene expiration (30-day TTL for anonymous, permanent for logged-in)

### Export Improvements
- [x] Bundle real effect engine into HTML export (replace hand-written JS copies)
- [-] Rebuild HTML/embed export pipeline to bundle fonts, multi-color support, and new features
- [x] GIF export (worker-based, sampled global palette, 256-color quality preset)
- [x] MP4/WebM video export (WebCodecs via mediabunny, worker-based, custom resolution dialog)
- [ ] npm package `txtfx-player` for embedding scenes in any website

### Distribution & Export Media (from the 2026-06 performance review)
- [ ] Wallpaper Engine web-wallpaper export (project.json package; Steam Workshop distribution) — the standalone HTML is ~90% of it
- [ ] Lively Wallpaper (Windows) / Plash (macOS) compatibility notes + docs page
- [ ] Perfect-loop helper for wallpaper/video exports (crossfade or simulate-to-loop-point so loops don't pop)
- [ ] Transparent WebM (VP9 alpha) export — overlays for OBS / video editors
- [ ] PNG image-sequence (zip) export for After Effects pipelines
- [ ] Animated WebP / APNG export (modern GIF replacement: full color + real alpha)
- [ ] CDN-hosted versioned player (`txtfx-player.js`) + `<txtfx-scene>` web component + React wrapper (IntersectionObserver pause, reduced-motion, DPR/FPS caps — player runtime already supports these)
- [ ] OBS browser-source preset (transparent standalone HTML)
- [ ] `npx txtfx` terminal screensaver / MOTD mode (terminal renderer already exists)
- [ ] Sprite-sheet export for game engines
- [ ] Scene seed UI (reroll button / seed field — engine is fully seeded as of Phase 6)

### Native / Rust Track (deferred — pursue only if native targets become a product goal)
- [ ] Rust + wgpu engine core compiled to native + WASM/WebGPU:
      headless export CLI (ffmpeg → H.264/HEVC/ProRes 4444 with real alpha, no browser codec lottery, faster-than-realtime 4K),
      native live-wallpaper binaries (macOS/Windows/Linux), single engine shared with web

### Editor Tools
- [ ] Image filters (brightness, contrast, saturation) before ASCII conversion
- [ ] Color eyedropper — sample colors from the source image
- [ ] Effect brush — paint effects onto specific regions (more granular than masks)
- [ ] Text overlay — add custom text on top of the canvas
- [-] Zoom to fit / zoom to selection
- [ ] Batch export (multiple scenes at once)

### Effects
- [ ] New effects: plasma, static/noise, ripple, vortex, dissolve, pixelate
- [ ] Effect layering blend modes (add, multiply, screen between effects)
- [ ] Per-effect opacity control
- [-] Randomized color palettes per burst (firework, etc.)

Notes:
- Manual zoom, pan, and reset view exist; actual "fit" and "selection" tools do not.
- Firework already supports multi-color/random/cycle/gradient behavior, but there is no explicit burst-palette system.

---

## Medium-Term Features

### User Accounts & Auth
- [ ] Sign up / sign in (email, GitHub, Google OAuth)
- [ ] User profiles with avatar, bio, links
- [-] Saved scenes per user (cloud storage, not just localStorage)
- [ ] Scene revision history with restore

### Public Gallery
- [ ] Browsable feed of shared scenes
- [ ] Like / favorite scenes
- [ ] View counts, trending sort
- [ ] Search by effect type, tags, author
- [ ] Featured / staff picks section
- [ ] Embed gallery widget for external sites

### Social
- [ ] Comments on shared scenes
- [ ] Follow creators
- [ ] Activity feed (new scenes from people you follow)
- [ ] Share to Twitter/X, Reddit, Discord with preview card (OG image)

Notes:
- Shared scenes are stored in the backend for anonymous links, but there is no user library/account model yet.

---

## Long-Term Features

### Templates & Marketplace
- [ ] Curated effect preset packs (cinematic, retro, cyberpunk, etc.)
- [ ] Community-submitted templates
- [ ] Categories, tags, ratings

### Teams & Collaboration
- [ ] Shared workspaces
- [ ] Role-based permissions (viewer, editor, admin)
- [ ] Edit history with attribution

### Analytics
- [ ] Per-scene view counts, embed counts

---

## Technical Debt / Architecture
- [ ] Migrate `editor.css` to hybrid Tailwind — keep CSS variables + grid layout in a slim CSS file, move component-level styles (buttons, panels, inputs, spacing) to Tailwind utility classes in JSX
- [ ] Mask coordinate alignment (center-crop mismatch between ASCII and mask)
- [ ] Export masking support in HTML runtime
- [x] Object pooling for `EffectCell` — superseded by SoA CellBuffer (typed arrays, packed colors, code points)
- [x] OffscreenCanvas + Web Worker — full export pipeline (render+encode) runs in a worker
- [-] Web Worker for effect computation — done for exports; editor preview stays on main thread (render is <1ms, GL path 0.3ms)
- [ ] GL-rendered exports behind a flag (kept on Canvas2D for cross-machine byte-reproducibility)
- [ ] Closed-form O(1) timeline seek (rejected for now: would teleport particles on param drags; revisit with per-run param epochs)
- [ ] Service Worker for offline support

Notes:
- The renderer already reuses large composite buffers and pools glow cells, but individual effect emitters still allocate frame data.
- Glow sprite caching can use `OffscreenCanvas`, but rendering still happens on the main thread and not in a worker.
