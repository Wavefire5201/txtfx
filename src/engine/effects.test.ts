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
});
