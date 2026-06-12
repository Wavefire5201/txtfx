import { describe, it, expect } from "vitest";
import { CellBuffer, cellBufferToArray, packRGB, packedToHex, NO_COLOR, NO_GLOW } from "./cell-buffer";
import { packHex, lerpPackedColor, pickColorPacked, WHITE_PACKED } from "./effects/color-util";
import { lerpColor, pickColor } from "./effects/color-util";

describe("CellBuffer", () => {
  it("grows past its initial capacity without losing cells", () => {
    const buf = new CellBuffer(4);
    for (let i = 0; i < 100; i++) {
      buf.push(i % 50, i, 65 + (i % 26), i / 100, packRGB(i, 0, 0), i % 10);
    }
    expect(buf.length).toBe(100);
    expect(buf.rows[99]).toBe(49);
    expect(buf.cols[99]).toBe(99);
    expect(buf.codes[0]).toBe(65);
    expect(buf.brightness[50]).toBeCloseTo(0.5);
    expect(buf.colors[3]).toBe(packRGB(3, 0, 0));
    expect(buf.glowRadius[12]).toBe(2);
  });

  it("clear() resets length and the buffer is reusable", () => {
    const buf = new CellBuffer(4);
    buf.push(1, 2, 65, 1);
    buf.clear();
    expect(buf.length).toBe(0);
    buf.push(3, 4, 66, 0.5);
    expect(buf.length).toBe(1);
    expect(buf.rows[0]).toBe(3);
  });

  it("defaults: NO_COLOR and NO_GLOW", () => {
    const buf = new CellBuffer();
    buf.push(0, 0, 65, 1);
    expect(buf.colors[0]).toBe(NO_COLOR);
    expect(buf.glowRadius[0]).toBe(NO_GLOW);
    const [cell] = cellBufferToArray(buf);
    expect(cell.color).toBeUndefined();
    expect(cell.glowRadius).toBeUndefined();
  });

  it("round-trips emoji code points intact", () => {
    const buf = new CellBuffer();
    for (const ch of ["🔥", "💧", "A", "·", "@"]) {
      buf.push(0, 0, ch.codePointAt(0)!, 1);
    }
    const chars = cellBufferToArray(buf).map((c) => c.char);
    expect(chars).toEqual(["🔥", "💧", "A", "·", "@"]);
  });
});

describe("packed colors", () => {
  it("packHex round-trips 6-digit and 3-digit hex", () => {
    expect(packedToHex(packHex("#00ff41"))).toBe("#00ff41");
    expect(packedToHex(packHex("#FF4060"))).toBe("#ff4060");
    expect(packedToHex(packHex("#0f4"))).toBe("#00ff44");
    expect(packHex("#000000")).not.toBe(NO_COLOR); // black is a real color
    expect(packHex("nonsense")).toBe(WHITE_PACKED);
  });

  it("lerpPackedColor matches string lerpColor EXACTLY across a sweep", () => {
    const pairs: Array<[string, string]> = [
      ["#00ff41", "#ffffff"],
      ["#ff4060", "#001020"],
      ["#123456", "#fedcba"],
      ["#000000", "#ffffff"],
    ];
    for (const [a, b] of pairs) {
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        expect(packedToHex(lerpPackedColor(packHex(a), packHex(b), t))).toBe(lerpColor(a, b, t));
      }
    }
  });

  it("pickColorPacked matches pickColor for every mode", () => {
    const palette = ["#ff0000", "#00ff00", "#0000ff"];
    const packed = palette.map(packHex);
    for (const mode of ["random", "cycle", "gradient"] as const) {
      for (let index = 0; index < 7; index++) {
        for (const t of [undefined, 0, 0.33, 0.5, 0.99, 1]) {
          expect(packedToHex(pickColorPacked(packed, mode, index, t))).toBe(
            pickColor(palette, mode, index, t),
          );
        }
      }
    }
    // Degenerate palettes
    expect(packedToHex(pickColorPacked([], "random", 0))).toBe("#ffffff");
    expect(packedToHex(pickColorPacked([packHex("#123456")], "gradient", 5, 0.5))).toBe("#123456");
  });
});
