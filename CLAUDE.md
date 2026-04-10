@AGENTS.md

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

**Structural params** (trigger regen): count, grid dimensions, spawn position, density
**Visual params** (hot-update only): colors, glowRadius, speed, intensity, spread

### Rendering architecture

- Static ASCII: DOM `<pre>` element (z-index 2)
- Effect text overlay: second DOM `<pre>` with identical CSS for ALL effect characters (z-index 3) — pixel-perfect alignment via same text layout engine. Optimized with batched spaces and sparse spans.
- Glow sprites: `<canvas>` for radial gradient blobs (z-index 4)
- When `applyToAscii` cells are active, corresponding positions in the static `<pre>` are replaced with spaces (hole-punching) to prevent doubling. Regular effect chars render on top without hole-punching.

### Animation timing

- `animationTime` (shared ref in store.ts): updated every frame at 60fps. Used by Timeline for smooth playhead.
- Store `currentTime`: only synced on pause/stop. NOT used during playback to avoid React re-render overhead.
- On pause: `wasPlayingRef` + `pauseGuardRef` prevent re-simulation. Effects freeze in place.
- On loop wrap: `simulateToTime()` re-inits effects, `dt=0` on wrap frame to prevent double-advance.
