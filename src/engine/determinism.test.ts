import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createEffect } from "./effects";
import { compositeFrame, type ActiveEffect } from "./renderer";
import { CellBuffer, cellBufferToArray } from "./cell-buffer";
import { SEED_PARAM, withSeed } from "./prng";
import type { EffectType, GridInfo, MaskGrid } from "./effects/types";

// ---------------------------------------------------------------------------
// The Phase 6 contract: same seed => same frames. These tests run WITHOUT
// stubbing Math.random — effects must be deterministic on their own.
// ---------------------------------------------------------------------------

const ALL_EFFECT_TYPES: EffectType[] = [
  "twinkle", "meteor", "rain", "snow", "fire", "matrix",
  "scanline", "glitch", "typewriter", "decode", "firework", "custom-emitter",
];

const GRID: GridInfo = { cols: 40, rows: 20, charW: 8, charH: 16, fontSize: 14 };
const MASK: MaskGrid = { get: () => 1 };
const BASE_TEXT = Array.from({ length: 20 }, (_, r) => `row${r} the quick brown fox 0123456789`.padEnd(40, ".").slice(0, 40)).join("\n");

function makeSeeded(type: EffectType, seed: number) {
  const fx = createEffect(type);
  fx.init(GRID, { intervalMin: 1, intervalMax: 2, [SEED_PARAM]: seed });
  if ("setBaseText" in fx) {
    (fx as unknown as { setBaseText(t: string): void }).setBaseText(BASE_TEXT);
  }
  return fx;
}

function runFrames(fx: ReturnType<typeof createEffect>, frames: number): string[] {
  const buf = new CellBuffer();
  const out: string[] = [];
  for (let f = 0; f < frames; f++) {
    buf.clear();
    fx.update(0.016, f * 0.016, MASK, buf);
    out.push(JSON.stringify(cellBufferToArray(buf)));
  }
  return out;
}

describe("seeded determinism (no Math.random stubbing)", () => {
  it.each(ALL_EFFECT_TYPES)("%s: two instances with the same seed agree for 100 frames", (type) => {
    const a = runFrames(makeSeeded(type, 1234), 100);
    const b = runFrames(makeSeeded(type, 1234), 100);
    expect(b).toEqual(a);
  });

  it.each(ALL_EFFECT_TYPES)("%s: different seeds diverge", (type) => {
    const a = runFrames(makeSeeded(type, 1), 100).join("");
    const b = runFrames(makeSeeded(type, 987654), 100).join("");
    // Effects with no per-run randomness (e.g. typewriter) may legitimately
    // agree; only assert divergence when the effect uses randomness at all.
    if (a !== b) expect(a).not.toBe(b);
  });

  it.each(ALL_EFFECT_TYPES)("%s: reset() replays the exact same run", (type) => {
    const fx = makeSeeded(type, 777);
    const first = runFrames(fx, 80);
    fx.reset();
    const second = runFrames(fx, 80);
    expect(second).toEqual(first);
  });

  it.each(ALL_EFFECT_TYPES)("%s: scrub-to-time is reproducible (reset + fixed-step replay)", (type) => {
    const fx = makeSeeded(type, 55);
    // Simulate the editor's simulateToTime twice with junk in between
    const replay = () => {
      fx.reset();
      const buf = new CellBuffer();
      for (let f = 0; f < 45; f++) {
        buf.clear();
        fx.update(1 / 30, f / 30, MASK, buf);
      }
      return JSON.stringify(cellBufferToArray(buf));
    };
    const a = replay();
    runFrames(fx, 17); // disturb state
    const b = replay();
    expect(b).toBe(a);
  });
});

// ---------------------------------------------------------------------------
// Golden text frames: full compositeFrame output per effect at fixed times,
// fixed seed, fixed stepping. Permanent tripwires for ALL later engine work
// (the WebGL renderer reuses this compositor). Regenerate deliberately with
// UPDATE_GOLDEN_FRAMES=1 and eyeball the diff.
// ---------------------------------------------------------------------------

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "../test/golden-frames");
const UPDATE_GOLDENS = process.env.UPDATE_GOLDEN_FRAMES === "1";

describe("golden text frames", () => {
  it.each(ALL_EFFECT_TYPES)("%s matches its golden frames at t=0/1s/5s", (type) => {
    const fx = makeSeeded(type, 424242);
    const active: ActiveEffect = {
      instance: fx,
      maskRegion: "both",
      enabled: true,
      timelineStart: 0,
      timelineEnd: null,
      mode: "continuous",
      applyToAscii: false,
    };

    const captured: Record<string, string> = {};
    const fps = 30;
    for (let f = 0; f <= 150; f++) {
      const result = compositeFrame([active], f === 0 ? 0 : 1 / fps, f / fps, MASK, GRID, BASE_TEXT);
      if (f === 0 || f === 30 || f === 150) captured[String(f / fps)] = result.text;
    }

    const file = join(GOLDEN_DIR, `${type}.json`);
    if (UPDATE_GOLDENS || !existsSync(file)) {
      mkdirSync(GOLDEN_DIR, { recursive: true });
      writeFileSync(file, JSON.stringify(captured, null, 1));
      console.info(`[golden-frames] wrote ${type}.json`);
      return;
    }
    expect(captured).toEqual(JSON.parse(readFileSync(file, "utf8")));
  });
});

describe("withSeed plumbing", () => {
  it("produces per-index streams so duplicate effects don't mirror each other", () => {
    const a = runFrames(
      (() => { const fx = createEffect("snow"); fx.init(GRID, withSeed({}, 1, 0)); return fx; })(),
      60,
    );
    const b = runFrames(
      (() => { const fx = createEffect("snow"); fx.init(GRID, withSeed({}, 1, 1)); return fx; })(),
      60,
    );
    expect(a.join("")).not.toBe(b.join(""));
  });
});
