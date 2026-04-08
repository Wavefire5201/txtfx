import { describe, it, expect } from "vitest";
import { compositeFrame, type ActiveEffect, type GlowCell } from "./renderer";
import type { GridInfo, MaskGrid, EffectCell, AsciiEffect, ControlDescriptor } from "./effects/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGrid(cols: number, rows: number): GridInfo {
  return { cols, rows, charW: 8, charH: 16, fontSize: 14 };
}

function makeMask(value = 1): MaskGrid {
  return { get: () => value };
}

/** Trivial effect that emits a fixed list of cells. */
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

function makeActive(
  instance: AsciiEffect,
  overrides: Partial<ActiveEffect> = {}
): ActiveEffect {
  return {
    instance,
    maskRegion: "both",
    enabled: true,
    timelineStart: 0,
    timelineEnd: null,
    mode: "one-shot" as const,
    applyToAscii: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("compositeFrame", () => {
  it("produces correct text output for a simple cell", () => {
    const grid = makeGrid(5, 3);
    const fx = new StubEffect();
    fx.cells = [{ row: 1, col: 2, char: "*", brightness: 1 }];

    const result = compositeFrame([makeActive(fx)], 0.016, 0, makeMask(), grid);

    const lines = result.text.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("     ");
    expect(lines[1][2]).toBe("*");
    expect(lines[2]).toBe("     ");
  });

  it("higher brightness cells win overlap resolution", () => {
    const grid = makeGrid(5, 3);

    const fxLow = new StubEffect();
    fxLow.cells = [{ row: 1, col: 2, char: ".", brightness: 0.3 }];

    const fxHigh = new StubEffect();
    fxHigh.cells = [{ row: 1, col: 2, char: "#", brightness: 0.9 }];

    // Low brightness first, high brightness second
    const result = compositeFrame(
      [makeActive(fxLow), makeActive(fxHigh)],
      0.016,
      0,
      makeMask(),
      grid
    );

    const lines = result.text.split("\n");
    expect(lines[1][2]).toBe("#");
  });

  it("higher brightness first still wins (order-independent)", () => {
    const grid = makeGrid(5, 3);

    const fxHigh = new StubEffect();
    fxHigh.cells = [{ row: 1, col: 2, char: "#", brightness: 0.9 }];

    const fxLow = new StubEffect();
    fxLow.cells = [{ row: 1, col: 2, char: ".", brightness: 0.3 }];

    const result = compositeFrame(
      [makeActive(fxHigh), makeActive(fxLow)],
      0.016,
      0,
      makeMask(),
      grid
    );

    const lines = result.text.split("\n");
    expect(lines[1][2]).toBe("#");
  });

  it("produces GlowCells for cells with color and glowRadius", () => {
    const grid = makeGrid(5, 3);
    const fx = new StubEffect();
    fx.cells = [
      { row: 0, col: 0, char: "*", brightness: 1, color: "#ff0000", glowRadius: 10 },
    ];

    const result = compositeFrame([makeActive(fx)], 0.016, 0, makeMask(), grid);

    expect(result.glowCount).toBe(1);
    const gc = result.glowCells[0];
    expect(gc.row).toBe(0);
    expect(gc.col).toBe(0);
    expect(gc.char).toBe("*");
    expect(gc.color).toBe("#ff0000");
    expect(gc.glowRadius).toBe(10);
  });

  it("empty effects produce blank grid", () => {
    const grid = makeGrid(4, 2);
    const result = compositeFrame([], 0.016, 0, makeMask(), grid);

    const lines = result.text.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("    ");
    expect(lines[1]).toBe("    ");
    expect(result.glowCount).toBe(0);
  });

  it("out-of-bounds cells are ignored", () => {
    const grid = makeGrid(3, 3);
    const fx = new StubEffect();
    fx.cells = [
      { row: -1, col: 0, char: "X", brightness: 1 },
      { row: 0, col: -1, char: "X", brightness: 1 },
      { row: 3, col: 0, char: "X", brightness: 1 },
      { row: 0, col: 3, char: "X", brightness: 1 },
      { row: 1, col: 1, char: "O", brightness: 1 }, // valid
    ];

    const result = compositeFrame([makeActive(fx)], 0.016, 0, makeMask(), grid);

    const lines = result.text.split("\n");
    // Only the valid cell should appear
    let charCount = 0;
    for (const line of lines) {
      for (const ch of line) {
        if (ch !== " ") charCount++;
      }
    }
    expect(charCount).toBe(1);
    expect(lines[1][1]).toBe("O");
  });

  it("disabled effects are skipped", () => {
    const grid = makeGrid(3, 3);
    const fx = new StubEffect();
    fx.cells = [{ row: 0, col: 0, char: "X", brightness: 1 }];

    const result = compositeFrame(
      [makeActive(fx, { enabled: false })],
      0.016,
      0,
      makeMask(),
      grid
    );

    const lines = result.text.split("\n");
    expect(lines[0][0]).toBe(" ");
  });

  it("timeline filtering works", () => {
    const grid = makeGrid(3, 3);
    const fx = new StubEffect();
    fx.cells = [{ row: 0, col: 0, char: "X", brightness: 1 }];

    // Effect starts at t=5, current time is 2 -> should be skipped
    const result = compositeFrame(
      [makeActive(fx, { timelineStart: 5 })],
      0.016,
      2,
      makeMask(),
      grid
    );

    const lines = result.text.split("\n");
    expect(lines[0][0]).toBe(" ");
  });

  it("mask region filtering works for foreground", () => {
    const grid = makeGrid(3, 3);
    const fx = new StubEffect();
    fx.cells = [{ row: 0, col: 0, char: "X", brightness: 1 }];

    // maskRegion=foreground skips when maskVal >= 0.5
    // mask returns 0.8 (>= 0.5) so foreground-only effect is filtered out
    const result = compositeFrame(
      [makeActive(fx, { maskRegion: "foreground" })],
      0.016,
      0,
      makeMask(0.8),
      grid
    );

    const lines = result.text.split("\n");
    expect(lines[0][0]).toBe(" ");
  });

  it("applyToAscii colorizes existing base text characters", () => {
    const grid = makeGrid(5, 1);
    const fx = new StubEffect();
    fx.cells = [
      { row: 0, col: 1, char: "X", brightness: 1, color: "#00ff00" },
    ];

    const result = compositeFrame(
      [makeActive(fx, { applyToAscii: true })],
      0.016,
      0,
      makeMask(),
      grid,
      "Hello"
    );

    // applyToAscii should NOT place the effect's "X" char; the text layer remains blank
    // but glowCells should reference the base char "e" at col 1
    expect(result.glowCount).toBe(1);
    expect(result.glowCells[0].char).toBe("e");
    expect(result.glowCells[0].color).toBe("#00ff00");
  });
});
