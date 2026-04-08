/**
 * Benchmark script for the txtfx rendering engine.
 * Measures hot paths: compositeFrame, individual effects, glow cache, full frame.
 *
 * Usage: bun scripts/benchmark.ts
 */

import { compositeFrame, type ActiveEffect } from "../src/engine/renderer";
import { createEffect } from "../src/engine/effects";
import type { EffectType, GridInfo, MaskGrid } from "../src/engine/effects/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGrid(cols: number, rows: number): GridInfo {
  return { cols, rows, charW: 8, charH: 16, fontSize: 14 };
}

function makeMask(value = 1): MaskGrid {
  return { get: () => value };
}

function makeActive(
  type: EffectType,
  grid: GridInfo,
  params: Record<string, unknown> = {}
): ActiveEffect {
  const instance = createEffect(type);
  instance.init(grid, params);
  return {
    instance,
    maskRegion: "both",
    enabled: true,
    timelineStart: 0,
    timelineEnd: null,
    loop: false,
    applyToAscii: false,
  };
}

interface BenchResult {
  name: string;
  gridSize: string;
  avgMs: number;
  opsPerSec: number;
  pass60fps: boolean;
  pass120fps: boolean;
}

function bench(name: string, gridSize: string, fn: () => void, iterations = 500): BenchResult {
  // Warmup
  for (let i = 0; i < 50; i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;

  const avgMs = elapsed / iterations;
  const opsPerSec = 1000 / avgMs;

  return {
    name,
    gridSize,
    avgMs,
    opsPerSec,
    pass60fps: avgMs < 16.6,
    pass120fps: avgMs < 8.3,
  };
}

function printTable(results: BenchResult[]) {
  const header = [
    "Operation".padEnd(35),
    "Grid".padEnd(12),
    "Avg (ms)".padStart(10),
    "Ops/sec".padStart(10),
    "60fps".padStart(7),
    "120fps".padStart(7),
  ].join(" | ");

  const separator = "-".repeat(header.length);

  console.log();
  console.log(separator);
  console.log(header);
  console.log(separator);

  for (const r of results) {
    const row = [
      r.name.padEnd(35),
      r.gridSize.padEnd(12),
      r.avgMs.toFixed(3).padStart(10),
      Math.round(r.opsPerSec).toString().padStart(10),
      (r.pass60fps ? " PASS" : " FAIL").padStart(7),
      (r.pass120fps ? " PASS" : " FAIL").padStart(7),
    ].join(" | ");
    console.log(row);
  }
  console.log(separator);
  console.log();
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

const ALL_EFFECTS: EffectType[] = [
  "twinkle", "meteor", "rain", "snow", "fire", "matrix",
  "scanline", "glitch", "typewriter", "decode", "firework", "custom-emitter",
];

const GRID_SIZES: [number, number][] = [
  [80, 40],
  [160, 80],
  [200, 100],
];

const EFFECT_CELL_COUNTS = [100, 500, 2000];

console.log("=== txtfx Rendering Engine Benchmarks ===");
console.log(`Date: ${new Date().toISOString()}`);
console.log(`Runtime: Bun ${typeof Bun !== "undefined" ? Bun.version : "N/A"}`);

// ---- 1. compositeFrame ----
console.log("\n## 1. compositeFrame() — composite overhead");

const compositeResults: BenchResult[] = [];

for (const [cols, rows] of GRID_SIZES) {
  for (const cellCount of EFFECT_CELL_COUNTS) {
    const grid = makeGrid(cols, rows);
    const mask = makeMask();

    // Create a stub effect with a fixed number of cells
    const fx = createEffect("twinkle");
    fx.init(grid, { count: cellCount });
    // Warm up the effect so it has cells ready
    fx.update(0.016, 0, mask);

    const active: ActiveEffect = {
      instance: fx,
      maskRegion: "both",
      enabled: true,
      timelineStart: 0,
      timelineEnd: null,
      loop: false,
      applyToAscii: false,
    };

    compositeResults.push(
      bench(
        `composite (${cellCount} cells)`,
        `${cols}x${rows}`,
        () => compositeFrame([active], 0.016, performance.now() / 1000, mask, grid),
      )
    );
  }
}

printTable(compositeResults);

// ---- 2. Individual Effect.update() ----
console.log("## 2. Effect.update() — per-effect cost");

const effectResults: BenchResult[] = [];
const benchGrid = makeGrid(120, 60);
const benchMask = makeMask();

for (const type of ALL_EFFECTS) {
  const fx = createEffect(type);
  fx.init(benchGrid, {});
  // Warm up particle effects
  for (let i = 0; i < 20; i++) fx.update(0.016, i * 0.016, benchMask);

  let t = 0.5;
  effectResults.push(
    bench(
      `${type}.update()`,
      "120x60",
      () => {
        t += 0.016;
        fx.update(0.016, t, benchMask);
      },
    )
  );
}

printTable(effectResults);

// ---- 3. Glow cache ----
console.log("## 3. Glow cache — hit vs miss");

// We can't import the real glow-cache without OffscreenCanvas, so we simulate
// the cache pattern with a Map (same perf characteristics for the lookup).
const glowResults: BenchResult[] = [];

{
  const cache = new Map<string, object>();
  function quantize(v: number) { return Math.round(v * 15) / 15; }
  function makeKey(r: number, g: number, b: number, rad: number, br: number) {
    return `${r},${g},${b},${rad},${Math.round(quantize(br) * 15)}`;
  }

  // Pre-fill cache
  for (let i = 0; i < 100; i++) {
    const key = makeKey(i * 2, 100, 50, 10 + (i % 5), i / 100);
    cache.set(key, { width: 20, height: 20 });
  }

  // Cache hits
  const hitKeys = Array.from(cache.keys());
  let hitIdx = 0;
  glowResults.push(
    bench(
      "getGlowSprite (cache HIT)",
      "N/A",
      () => {
        cache.get(hitKeys[hitIdx % hitKeys.length]);
        hitIdx++;
      },
      10000,
    )
  );

  // Cache misses
  let missIdx = 0;
  glowResults.push(
    bench(
      "getGlowSprite (cache MISS)",
      "N/A",
      () => {
        const key = `miss_${missIdx++}_0_0_10_8`;
        if (!cache.has(key)) {
          cache.set(key, { width: 20, height: 20 });
        }
      },
      10000,
    )
  );
}

printTable(glowResults);

// ---- 4. Full frame simulation ----
console.log("## 4. Full frame — effects + composite + text build");

const fullFrameResults: BenchResult[] = [];

for (const [cols, rows] of GRID_SIZES) {
  const grid = makeGrid(cols, rows);
  const mask = makeMask();

  // Create a realistic mix of 3 effects
  const effects: ActiveEffect[] = [
    makeActive("twinkle", grid, { count: 50 }),
    makeActive("rain", grid, { density: 0.2 }),
    makeActive("scanline", grid, { count: 1 }),
  ];

  // Warm up
  let t = 0;
  for (let i = 0; i < 20; i++) {
    t += 0.016;
    compositeFrame(effects, 0.016, t, mask, grid);
  }

  fullFrameResults.push(
    bench(
      `full frame (3 effects)`,
      `${cols}x${rows}`,
      () => {
        t += 0.016;
        compositeFrame(effects, 0.016, t, mask, grid);
      },
    )
  );
}

printTable(fullFrameResults);

// ---- Summary ----
const allResults = [...compositeResults, ...effectResults, ...fullFrameResults];
const totalPass60 = allResults.filter((r) => r.pass60fps).length;
const totalPass120 = allResults.filter((r) => r.pass120fps).length;

console.log("## Summary");
console.log(`  60fps budget (16.6ms): ${totalPass60}/${allResults.length} pass`);
console.log(`  120fps budget (8.3ms): ${totalPass120}/${allResults.length} pass`);
console.log();
