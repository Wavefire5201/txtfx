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
- [ ] GIF export (record animation frames -> encode as GIF)
- [ ] MP4/WebM video export (MediaRecorder API on canvas)
- [ ] npm package `txtfx-player` for embedding scenes in any website

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
- [ ] Premium templates (paid)

### Teams & Collaboration
- [ ] Shared workspaces
- [ ] Real-time collaborative editing
- [ ] Role-based permissions (viewer, editor, admin)
- [ ] Edit history with attribution

### Analytics
- [ ] Per-scene view counts, embed counts
- [ ] Referrer tracking (where are embeds being used)
- [ ] Creator dashboard with stats over time

### Monetization
- [ ] Free tier: basic effects, watermark on export
- [ ] Pro tier: all effects, no watermark, video export, priority rendering
- [ ] API access for programmatic scene generation

### Platform
- [ ] Mobile app (React Native or PWA)
- [ ] CLI tool for batch processing images
- [ ] Figma/Framer plugin
- [ ] WordPress plugin for embedding
- [ ] OBS overlay integration for live streaming

---

## Technical Debt / Architecture
- [ ] Migrate `editor.css` to hybrid Tailwind — keep CSS variables + grid layout in a slim CSS file, move component-level styles (buttons, panels, inputs, spacing) to Tailwind utility classes in JSX
- [ ] Mask coordinate alignment (center-crop mismatch between ASCII and mask)
- [ ] Export masking support in HTML runtime
- [-] Object pooling for `EffectCell` (eliminate remaining per-frame allocations)
- [ ] WebGL renderer — full GPU-accelerated pipeline (font atlas + instanced quads + fragment shader glow). Path to 120fps+. Replace DOM text + Canvas 2D hybrid with single WebGL context. SDF text for crisp scaling.
- [-] OffscreenCanvas + Web Worker for glow rendering (off main thread)
- [ ] Web Worker for effect computation (off main thread)
- [ ] Service Worker for offline support

Notes:
- The renderer already reuses large composite buffers and pools glow cells, but individual effect emitters still allocate frame data.
- Glow sprite caching can use `OffscreenCanvas`, but rendering still happens on the main thread and not in a worker.
