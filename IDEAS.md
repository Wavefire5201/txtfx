# txtfx — Feature Ideas & Roadmap

## Current State
- 12 ASCII effects with color, glow, and per-effect controls
- Timeline with draggable effect bars, playback controls
- Mask painting (foreground/background regions)
- Export: standalone HTML, embed snippet, scene JSON
- Auto-save, undo/redo, effect presets
- Light/dark mode, responsive layout

---

## Near-Term Features

### Sharing & Backend
- [ ] Short link sharing via database (replace base64 URL hack)
- [ ] API routes: POST /api/scenes (create), GET /api/scenes/[id] (load)
- [ ] Scene expiration (30-day TTL for anonymous, permanent for logged-in)

### Export Improvements
- [ ] Bundle real effect engine into HTML export (replace hand-written JS copies)
- [ ] GIF export (record animation frames → encode as GIF)
- [ ] MP4/WebM video export (MediaRecorder API on canvas)
- [ ] npm package `txtfx-player` for embedding scenes in any website

### Editor Tools
- [ ] Image filters (brightness, contrast, saturation) before ASCII conversion
- [ ] Color eyedropper — sample colors from the source image
- [ ] Effect brush — paint effects onto specific regions (more granular than masks)
- [ ] Text overlay — add custom text on top of the canvas
- [ ] Zoom to fit / zoom to selection
- [ ] Batch export (multiple scenes at once)

### Effects
- [ ] New effects: plasma, static/noise, ripple, vortex, dissolve, pixelate
- [ ] Effect layering blend modes (add, multiply, screen between effects)
- [ ] Per-effect opacity control
- [ ] Randomized color palettes per burst (firework, etc.)

---

## Medium-Term Features

### User Accounts & Auth
- [ ] Sign up / sign in (email, GitHub, Google OAuth)
- [ ] User profiles with avatar, bio, links
- [ ] Saved scenes per user (cloud storage, not just localStorage)
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
- [ ] Mask coordinate alignment (center-crop mismatch between ASCII and mask)
- [ ] Export masking support in HTML runtime
- [ ] Object pooling for EffectCell (eliminate remaining per-frame allocations)
- [ ] WebGL renderer option for high-performance glow
- [ ] Web Worker for effect computation (off main thread)
- [ ] Service Worker for offline support
