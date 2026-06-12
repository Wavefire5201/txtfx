import { describe, it, expect, afterEach } from "vitest";
import { createEffect } from "./effects";
import { compositeFrame, type ActiveEffect } from "./renderer";
import { pickColor } from "./effects/color-util";
import type { AsciiEffect, ControlDescriptor, EffectCell, EffectType, GridInfo, MaskGrid } from "./effects/types";
import { seedMathRandom } from "@/test/fixtures";

// ---------------------------------------------------------------------------
// Edge-case catalog — extreme grids, degenerate params, and boundary times.
// These pin CURRENT behavior; cases marked TODO are known limitations with a
// planned fix phase.
// ---------------------------------------------------------------------------

function makeGrid(cols: number, rows: number): GridInfo {
  return { cols, rows, charW: 8, charH: 16, fontSize: 14 };
}

const MASK: MaskGrid = { get: () => 1 };

const ALL_EFFECT_TYPES: EffectType[] = [
  "twinkle", "meteor", "rain", "snow", "fire", "matrix",
  "scanline", "glitch", "typewriter", "decode", "firework", "custom-emitter",
];

class StubEffect implements AsciiEffect {
  type = "stub";
  cells: EffectCell[] = [];
  init() {}
  update(): EffectCell[] {
    return this.cells;
  }
  getControls(): ControlDescriptor[] {
    return [];
  }
}

function makeActive(instance: AsciiEffect, overrides: Partial<ActiveEffect> = {}): ActiveEffect {
  return {
    instance,
    maskRegion: "both",
    enabled: true,
    timelineStart: 0,
    timelineEnd: null,
    mode: "continuous",
    applyToAscii: false,
    ...overrides,
  };
}

let restoreRandom: (() => void) | null = null;
afterEach(() => {
  restoreRandom?.();
  restoreRandom = null;
});

describe("extreme grids", () => {
  const GRIDS: Array<[number, number]> = [
    [1, 1],
    [1, 200],
    [200, 1],
  ];

  it.each(
    ALL_EFFECT_TYPES.flatMap((type) => GRIDS.map(([c, r]) => [type, c, r] as const)),
  )("%s survives a %s x %s grid and stays in bounds", (type, cols, rows) => {
    restoreRandom = seedMathRandom(7);
    const grid = makeGrid(cols, rows);
    const fx = createEffect(type);
    fx.init(grid, {});
    if ("setBaseText" in fx) {
      (fx as unknown as { setBaseText(t: string): void }).setBaseText("#".repeat(cols));
    }

    for (let i = 0; i < 30; i++) {
      const cells = fx.update(0.016, i * 0.016, MASK);
      for (const cell of cells) {
        expect(cell.row).toBeGreaterThanOrEqual(0);
        expect(cell.row).toBeLessThan(rows);
        expect(cell.col).toBeGreaterThanOrEqual(0);
        expect(cell.col).toBeLessThan(cols);
      }
    }
  });
});

describe("degenerate params", () => {
  it.each(ALL_EFFECT_TYPES)("%s tolerates an empty colors array", (type) => {
    restoreRandom = seedMathRandom(7);
    const fx = createEffect(type);
    fx.init(makeGrid(20, 10), { colors: [] });
    for (let i = 0; i < 30; i++) {
      expect(() => fx.update(0.016, i * 0.016, MASK)).not.toThrow();
    }
  });

  it("pickColor falls back to white for an empty palette", () => {
    expect(pickColor([], "random", 0)).toBe("#ffffff");
    expect(pickColor([], "gradient", 0, 0.5)).toBe("#ffffff");
  });

  it.each(ALL_EFFECT_TYPES)("%s clamps huge dt without escaping the grid", (type) => {
    restoreRandom = seedMathRandom(7);
    const grid = makeGrid(40, 20);
    const fx = createEffect(type);
    fx.init(grid, {});
    // Simulate a tab coming back from background: one giant step
    const cells = fx.update(10, 10, MASK);
    for (const cell of cells) {
      expect(cell.row).toBeGreaterThanOrEqual(0);
      expect(cell.row).toBeLessThan(grid.rows);
      expect(cell.col).toBeGreaterThanOrEqual(0);
      expect(cell.col).toBeLessThan(grid.cols);
    }
  });
});

describe("timeline boundaries (compositeFrame)", () => {
  function frameAt(time: number, overrides: Partial<ActiveEffect>): string {
    const fx = new StubEffect();
    fx.cells = [{ row: 0, col: 0, char: "X", brightness: 1 }];
    const result = compositeFrame([makeActive(fx, overrides)], 0.016, time, MASK, makeGrid(3, 1));
    return result.text[0];
  }

  it("includes the effect exactly at timelineStart and timelineEnd (inclusive bounds)", () => {
    expect(frameAt(5, { timelineStart: 5, timelineEnd: 10 })).toBe("X");
    expect(frameAt(10, { timelineStart: 5, timelineEnd: 10 })).toBe("X");
  });

  it("excludes the effect just outside the window", () => {
    expect(frameAt(4.999, { timelineStart: 5, timelineEnd: 10 })).toBe(" ");
    expect(frameAt(10.001, { timelineStart: 5, timelineEnd: 10 })).toBe(" ");
  });

  it("emits nothing when timelineEnd precedes timelineStart", () => {
    expect(frameAt(3, { timelineStart: 5, timelineEnd: 2 })).toBe(" ");
    expect(frameAt(0, { timelineStart: 5, timelineEnd: 2 })).toBe(" ");
  });

  it("handles a zero-length continuous window without dividing by zero", () => {
    expect(() => frameAt(5, { timelineStart: 5, timelineEnd: 5, mode: "continuous" })).not.toThrow();
  });
});

describe("mask boundary at exactly 0.5", () => {
  function withMask(value: number, region: ActiveEffect["maskRegion"]): number {
    const fx = new StubEffect();
    fx.cells = [{ row: 0, col: 0, char: "X", brightness: 1 }];
    const mask: MaskGrid = { get: () => value };
    const result = compositeFrame([makeActive(fx, { maskRegion: region })], 0.016, 0, mask, makeGrid(2, 1));
    return result.text[0] === "X" ? 1 : 0;
  }

  it("0.5 counts as background (>= 0.5): background-region effects render, foreground do not", () => {
    expect(withMask(0.5, "background")).toBe(1);
    expect(withMask(0.5, "foreground")).toBe(0);
    expect(withMask(0.4999, "background")).toBe(0);
    expect(withMask(0.4999, "foreground")).toBe(1);
  });
});

describe("custom-emitter with multi-code-unit characters", () => {
  // TODO(soa-cell-buffers phase): chars are indexed by UTF-16 code unit, so an
  // emoji like "🔥" (2 code units) is emitted as lone surrogate halves. The SoA
  // refactor must store code points (codePointAt / Uint32Array) instead. This
  // test pins the current (lossy but non-crashing) behavior.
  it("does not crash and currently emits single UTF-16 code units (lone surrogates)", () => {
    restoreRandom = seedMathRandom(7);
    const fx = createEffect("custom-emitter");
    fx.init(makeGrid(40, 20), { chars: "🔥💧", spawnRate: 100 });

    let sawSurrogateHalf = false;
    for (let i = 0; i < 60; i++) {
      const cells = fx.update(0.016, i * 0.016, MASK);
      for (const cell of cells) {
        expect(cell.char.length).toBe(1);
        const code = cell.char.charCodeAt(0);
        if (code >= 0xd800 && code <= 0xdfff) sawSurrogateHalf = true;
      }
    }
    // "🔥💧" consists ONLY of surrogate pairs, so every emitted char is a half.
    expect(sawSurrogateHalf).toBe(true);
  });
});

describe("repeated dt=0 at arbitrary times", () => {
  it.each(ALL_EFFECT_TYPES)("%s is stable under repeated dt=0 updates", (type) => {
    restoreRandom = seedMathRandom(7);
    const fx = createEffect(type);
    fx.init(makeGrid(40, 20), {});
    for (let i = 0; i < 120; i++) fx.update(0.016, i * 0.016, MASK);
    // Paused scrubbing hammering the same timestamp must not throw or drift bounds
    for (let i = 0; i < 20; i++) {
      const cells = fx.update(0, 1.92, MASK);
      for (const cell of cells) {
        expect(cell.row).toBeGreaterThanOrEqual(0);
        expect(cell.row).toBeLessThan(20);
      }
    }
  });
});
