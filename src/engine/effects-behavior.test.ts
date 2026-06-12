import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createEffect } from "./effects";
import { CellBuffer, cellBufferToArray } from "./cell-buffer";
import { SEED_PARAM } from "./prng";
import type { EffectType, GridInfo, MaskGrid } from "./effects/types";
import { seedMathRandom } from "@/test/fixtures";

// ---------------------------------------------------------------------------
// Behavior-pinning snapshots for ALL effects, captured with seeded RNG from
// the implementation BEFORE the SoA cell-buffer refactor. The refactor must
// reproduce identical cells (positions, chars, brightness, colors, glow) —
// it changes the storage format, not the behavior or the RNG draw order.
//
// Regenerate deliberately with UPDATE_EFFECT_SNAPSHOTS=1 (and eyeball the
// diff) only when an effect's behavior is INTENTIONALLY changed.
// ---------------------------------------------------------------------------

const SNAPSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../test/effect-snapshots");
const UPDATE = process.env.UPDATE_EFFECT_SNAPSHOTS === "1";

const ALL_EFFECT_TYPES: EffectType[] = [
  "twinkle", "meteor", "rain", "snow", "fire", "matrix",
  "scanline", "glitch", "typewriter", "decode", "firework", "custom-emitter",
];

const GRID: GridInfo = { cols: 40, rows: 20, charW: 8, charH: 16, fontSize: 14 };
const MASK: MaskGrid = { get: () => 1 };
const SAMPLE_FRAMES = new Set([1, 60, 150, 299]);
const BASE_TEXT = Array.from({ length: 20 }, (_, r) => `row${r} abcdefgHIJKLMNOP 0123456789#%@*`.padEnd(40, ".").slice(0, 40)).join("\n");

/** Canonical, order-independent serialization of one frame's cells. */
function serializeCells(
  cells: Array<{ row: number; col: number; char: string; brightness?: number; color?: string; glowRadius?: number }>,
): string[] {
  return cells
    .map((c) =>
      [
        c.row,
        c.col,
        c.char,
        (c.brightness ?? 0.5).toFixed(4),
        (c.color ?? "").toLowerCase(),
        c.glowRadius ?? "",
      ].join("|"),
    )
    .sort();
}

function captureSnapshot(type: EffectType): Record<string, string[]> {
  // Math.random stub is now only a safety net — seeded effects draw from
  // their own PRNG (SEED_PARAM); any remaining Math.random use is a bug
  // this stub keeps deterministic enough to catch via snapshot drift.
  const restore = seedMathRandom(20260612);
  try {
    const fx = createEffect(type);
    fx.init(GRID, { intervalMin: 1, intervalMax: 2, [SEED_PARAM]: 20260612 });
    if ("setBaseText" in fx) {
      (fx as unknown as { setBaseText(t: string): void }).setBaseText(BASE_TEXT);
    }
    const frames: Record<string, string[]> = {};
    const buf = new CellBuffer();
    for (let f = 0; f < 300; f++) {
      buf.clear();
      fx.update(0.016, f * 0.016, MASK, buf);
      if (SAMPLE_FRAMES.has(f)) frames[String(f)] = serializeCells(cellBufferToArray(buf));
    }
    return frames;
  } finally {
    restore();
  }
}

describe("effect behavior snapshots (seeded)", () => {
  it.each(ALL_EFFECT_TYPES)("%s matches its pinned snapshot", (type) => {
    const snapshot = captureSnapshot(type);
    const file = join(SNAPSHOT_DIR, `${type}.json`);

    if (UPDATE || !existsSync(file)) {
      mkdirSync(SNAPSHOT_DIR, { recursive: true });
      writeFileSync(file, JSON.stringify(snapshot, null, 1));
      console.info(`[effect-snapshot] wrote ${type}.json`);
      return;
    }

    const pinned = JSON.parse(readFileSync(file, "utf8")) as Record<string, string[]>;
    expect(snapshot).toEqual(pinned);
  });
});
