@AGENTS.md

## Project

- Package manager: **bun** (never use npm)

## Testing

- Run tests with `bun run test` (unit, node) and `bun run test:browser` (golden/pixel tests in real Chromium via vitest browser mode). `bun run test:all` runs both.
- **Never use bare `bun test`** — it invokes bun's own test runner, which lacks vitest APIs and cannot run browser tests.
- Golden PNGs live in `src/test/goldens/`. A failing golden writes `<name>.actual.png` beside it for comparison. If a visual change is intentional, regenerate with `UPDATE_GOLDENS=1 bun run test:browser` and eyeball the diff before committing. Pixel goldens are machine-specific (font/AA rendering varies across OSes), so the byte comparison is **skipped in CI** (`CI=true`, or `SKIP_GOLDENS=1`) and enforced locally — see `__SKIP_GOLDENS__` in `src/test/pixel.ts`.
- Effects are **seeded** and never call Math.random (see the Determinism contract below): same seed + update sequence ⇒ identical frames. `seedMathRandom()` from `src/test/fixtures.ts` remains only for tests exercising incidental, non-seeded randomness.

## Effect Engine Conventions

### init() must preserve particle state

Effect `init(grid, params)` is called on EVERY param change (slider drag, toggle, etc). It MUST NOT regenerate random particle state (positions, phases) unless structural params changed.

Pattern:
```typescript
init(grid: GridInfo, params: Record<string, unknown>): void {
  const newCount = (params.count as number) ?? 50;
  const needsRegen = this.particles.length === 0
    || newCount !== this.count
    || grid.cols !== this.grid.cols
    || grid.rows !== this.grid.rows;

  this.grid = grid;           // Store AFTER the check
  this.count = newCount;
  this.glowRadius = ...;      // Always update visual params

  if (needsRegen) {
    this.particles = [...];   // Regenerate from scratch
  }
  // else: particles keep their positions/phases
}
```

**Structural params** (trigger regen): count, grid dimensions, spawn position, density, seed
**Visual params** (hot-update only): colors, glowRadius, speed, intensity, spread

### Determinism contract (seeded effects)

- Effects NEVER call Math.random. Each instance owns a mulberry32 stream
  (`this.rng`), seeded from the injected `__seed` param (hosts inject it via
  `withSeed(params, scene.seed, effectIndex)` from `src/engine/prng.ts`).
- `regen()` re-seeds the rng FIRST, then rebuilds ALL mutable runtime state
  (particles, accumulators, timers, spawn counters). `reset()` = `regen()`.
- Contract: same seed + same update() sequence after reset() => identical
  frames. This powers reproducible exports, scrub-stable previews, identical
  loop passes, and the snapshot tests below.
- Behavior is pinned by `src/test/effect-snapshots/` (per-effect seeded cells;
  regenerate with UPDATE_EFFECT_SNAPSHOTS=1) and `src/test/golden-frames/`
  (compositeFrame text at fixed times; UPDATE_GOLDEN_FRAMES=1). Regenerate
  only for INTENTIONAL behavior changes, and eyeball the diff.

### Rendering architecture

The default path is a **WebGL2 instanced glyph-atlas renderer** (`src/engine/gl/`) — one canvas draws the backdrop, base glyphs, glow, and effect glyphs, shared by editor, player, and export. The DOM/Canvas2D path below is the fallback when WebGL2 is unavailable and remains the visual-regression oracle.

Canvas2D / DOM fallback:
- Static ASCII: DOM `<pre>` element (z-index 2)
- Effect text overlay: second DOM `<pre>` with identical CSS for ALL effect characters (z-index 3) — pixel-perfect alignment via same text layout engine. Optimized with batched spaces and sparse spans.
- Glow sprites: `<canvas>` for radial gradient blobs (z-index 4)
- When `applyToAscii` cells are active, corresponding positions in the static `<pre>` are replaced with spaces (hole-punching) to prevent doubling. Regular effect chars render on top without hole-punching.

### Animation timing

- `animationTime` (shared ref in store.ts): updated every frame at 60fps. Used by Timeline for smooth playhead.
- Store `currentTime`: only synced on pause/stop. NOT used during playback to avoid React re-render overhead.
- On pause: `wasPlayingRef` + `pauseGuardRef` prevent re-simulation. Effects freeze in place.
- On loop wrap: `simulateToTime()` re-inits effects, `dt=0` on wrap frame to prevent double-advance.
