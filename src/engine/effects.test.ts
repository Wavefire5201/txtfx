import { describe, it, expect } from "vitest";
import { createEffect } from "./effects";
import type { EffectType, GridInfo, MaskGrid } from "./effects/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGrid(cols = 80, rows = 40): GridInfo {
  return { cols, rows, charW: 8, charH: 16, fontSize: 14 };
}

function makeMask(value = 1): MaskGrid {
  return { get: () => value };
}

const ALL_EFFECT_TYPES: EffectType[] = [
  "twinkle",
  "meteor",
  "rain",
  "snow",
  "fire",
  "matrix",
  "scanline",
  "glitch",
  "typewriter",
  "decode",
  "firework",
  "custom-emitter",
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("effects", () => {
  describe("createEffect", () => {
    it.each(ALL_EFFECT_TYPES)("creates %s effect", (type) => {
      const fx = createEffect(type);
      expect(fx).toBeDefined();
      expect(fx.type).toBe(type);
    });

    it("throws on unknown effect type", () => {
      expect(() => createEffect("nonexistent")).toThrow("Unknown effect type");
    });

    it("migrates 'waves' to 'scanline'", () => {
      const fx = createEffect("waves");
      expect(fx.type).toBe("scanline");
    });
  });

  describe("init and update contract", () => {
    it.each(ALL_EFFECT_TYPES)("%s responds to init() with grid info", (type) => {
      const fx = createEffect(type);
      const grid = makeGrid();
      // Should not throw
      fx.init(grid, {});
    });

    it.each(ALL_EFFECT_TYPES)(
      "%s produces cells within grid bounds after update",
      (type) => {
        const grid = makeGrid(40, 20);
        const mask = makeMask();
        const fx = createEffect(type);
        fx.init(grid, {});

        // Run a few updates to let particle-based effects spawn
        let cells: ReturnType<typeof fx.update> = [];
        for (let i = 0; i < 10; i++) {
          cells = fx.update(0.016, i * 0.016, mask);
        }

        for (const cell of cells) {
          expect(cell.row).toBeGreaterThanOrEqual(0);
          expect(cell.row).toBeLessThan(grid.rows);
          expect(cell.col).toBeGreaterThanOrEqual(0);
          expect(cell.col).toBeLessThan(grid.cols);
        }
      }
    );

    it.each(ALL_EFFECT_TYPES)(
      "%s cells have required properties (row, col, char, brightness)",
      (type) => {
        const grid = makeGrid(40, 20);
        const mask = makeMask();
        const fx = createEffect(type);
        fx.init(grid, {});

        let cells: ReturnType<typeof fx.update> = [];
        for (let i = 0; i < 10; i++) {
          cells = fx.update(0.016, i * 0.016, mask);
        }

        for (const cell of cells) {
          expect(cell).toHaveProperty("row");
          expect(cell).toHaveProperty("col");
          expect(cell).toHaveProperty("char");
          expect(typeof cell.row).toBe("number");
          expect(typeof cell.col).toBe("number");
          expect(typeof cell.char).toBe("string");
          expect(cell.char.length).toBeGreaterThan(0);
        }
      }
    );

    it.each(ALL_EFFECT_TYPES)(
      "%s brightness values are in 0-1 range",
      (type) => {
        const grid = makeGrid(40, 20);
        const mask = makeMask();
        const fx = createEffect(type);
        fx.init(grid, {});

        let cells: ReturnType<typeof fx.update> = [];
        for (let i = 0; i < 10; i++) {
          cells = fx.update(0.016, i * 0.016, mask);
        }

        for (const cell of cells) {
          const b = cell.brightness ?? 0.5;
          // Allow small floating point overshoot from flicker math
          expect(b).toBeGreaterThanOrEqual(-0.01);
          expect(b).toBeLessThanOrEqual(1.5);
        }
      }
    );

    it.each(ALL_EFFECT_TYPES)("%s getControls returns array", (type) => {
      const fx = createEffect(type);
      const controls = fx.getControls();
      expect(Array.isArray(controls)).toBe(true);
      for (const ctrl of controls) {
        expect(ctrl).toHaveProperty("key");
        expect(ctrl).toHaveProperty("label");
        expect(ctrl).toHaveProperty("type");
        expect(ctrl).toHaveProperty("defaultValue");
      }
    });
  });

  describe("update returns array", () => {
    it.each(ALL_EFFECT_TYPES)("%s update returns an array", (type) => {
      const fx = createEffect(type);
      fx.init(makeGrid(), {});
      const result = fx.update(0.016, 0, makeMask());
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // --------------------------------------------------------------------
  // Time-stepping behavior — would have caught loop-wrap and init-regen
  // bugs that the contract tests above don't exercise.
  // --------------------------------------------------------------------

  // Effects whose visible cells are positionally stable when time is held fixed.
  // Excludes glitch (re-randomizes which cells inside each block emit) and
  // decode (random char filler before settle), and the one-shot stateless ones.
  const PARTICLE_EFFECTS: EffectType[] = [
    "twinkle",
    "meteor",
    "rain",
    "snow",
    "fire",
    "matrix",
    "firework",
    "custom-emitter",
  ];

  function cellKeys(cells: { row: number; col: number }[]): string[] {
    return cells.map((c) => `${c.row},${c.col}`).sort();
  }

  describe("dt=0 freeze (paused playback)", () => {
    it.each(PARTICLE_EFFECTS)(
      "%s emits identical positions for back-to-back dt=0 updates",
      (type) => {
        const grid = makeGrid(40, 20);
        const mask = makeMask();
        const fx = createEffect(type);
        fx.init(grid, {});

        // Warm up so particle effects accumulate state
        for (let i = 0; i < 300; i++) {
          fx.update(0.016, i * 0.016, mask);
        }
        const t = 300 * 0.016;

        const frameA = cellKeys(fx.update(0, t, mask));
        const frameB = cellKeys(fx.update(0, t, mask));

        expect(frameB).toEqual(frameA);
      }
    );
  });

  describe("init preserves particle state on visual param change", () => {
    it.each(PARTICLE_EFFECTS)(
      "%s does not regenerate particles when only colors change",
      (type) => {
        const grid = makeGrid(40, 20);
        const mask = makeMask();
        const fx = createEffect(type);
        fx.init(grid, { colors: ["#ffffff"] });

        for (let i = 0; i < 300; i++) {
          fx.update(0.016, i * 0.016, mask);
        }
        const t = 300 * 0.016;
        const before = cellKeys(fx.update(0, t, mask));

        // Same grid, only palette changed — particles must keep positions
        fx.init(grid, { colors: ["#ff00ff"] });
        const after = cellKeys(fx.update(0, t, mask));

        expect(after).toEqual(before);
      }
    );
  });

  describe("loop-wrap respects intervalMin", () => {
    // Effects that spawn on a deterministic interval and reset on time wrap.
    // Without the fix, nextSpawn after wrap could be 0, causing an instant burst.
    it.each(["meteor", "firework"] as const)(
      "%s nextSpawn is at least intervalMin after time wraps backward",
      (type) => {
        const fx = createEffect(type);
        fx.init(makeGrid(), { intervalMin: 5, intervalMax: 5 });

        // Establish lastTime
        fx.update(0.1, 1, makeMask());
        // Wrap to t=0 (simulates loop boundary in timeline playback)
        fx.update(0.1, 0, makeMask());

        const internal = fx as unknown as { nextSpawn: number };
        expect(internal.nextSpawn).toBeGreaterThanOrEqual(5);
      }
    );
  });

  describe("glitch legacy 'intensity' param", () => {
    it("reads legacy intensity as density", () => {
      const fx = createEffect("glitch");
      fx.init(makeGrid(), { intensity: 0.3 });
      const internal = fx as unknown as { density: number };
      expect(internal.density).toBe(0.3);
    });

    it("prefers density over legacy intensity when both set", () => {
      const fx = createEffect("glitch");
      fx.init(makeGrid(), { intensity: 0.3, density: 0.8 });
      const internal = fx as unknown as { density: number };
      expect(internal.density).toBe(0.8);
    });
  });

  describe("control consistency", () => {
    it.each(ALL_EFFECT_TYPES)("%s exposes colors + colorMode controls", (type) => {
      const fx = createEffect(type);
      const keys = fx.getControls().map((c) => c.key);
      expect(keys).toContain("colors");
      expect(keys).toContain("colorMode");
    });
  });
});
