import { describe, expect, it } from "vitest";
import type { ActiveEffect } from "../renderer";
import { CellBuffer, NO_COLOR, NO_GLOW } from "../cell-buffer";
import { packHex } from "../effects/color-util";
import type { AsciiEffect, ControlDescriptor, EffectCell, GridInfo, MaskGrid } from "../effects/types";
import {
  calculateCharAdvance,
  collectAsciiOverlayHoles,
  getFrameDelta,
  getFrameTime,
} from "./video";
import {
  getGifDuration,
  getGifFrameCount,
  pickPaletteSampleFrames,
  shouldQuantizeGifFrame,
} from "./gif";
import {
  createExportMetrics,
  estimateExportCost,
  finishExportMetrics,
  formatBytes,
} from "./diagnostics";
import { resolveGifPreset, resolveVideoPreset } from "./presets";
import { renderAnsiFrame, renderPlainTextFrame, renderTerminalAnsiFrame, renderTerminalTextFrame, stripAnsi } from "./text";

class StubEffect implements AsciiEffect {
  type = "stub";
  constructor(private readonly cells: EffectCell[]) {}
  init() {}
  update(_dt: number, _time: number, _mask: MaskGrid, out: CellBuffer): void {
    for (const c of this.cells) {
      out.push(
        c.row, c.col, c.char.codePointAt(0)!, c.brightness ?? 0.5,
        c.color ? packHex(c.color) : NO_COLOR, c.glowRadius ?? NO_GLOW,
      );
    }
  }
  getControls(): ControlDescriptor[] {
    return [];
  }
}

function makeActive(instance: AsciiEffect): ActiveEffect {
  return {
    instance,
    maskRegion: "both",
    enabled: true,
    timelineStart: 0,
    timelineEnd: null,
    mode: "one-shot",
    applyToAscii: false,
  };
}

const grid: GridInfo = { cols: 4, rows: 2, charW: 8, charH: 12, fontSize: 10 };
const mask: MaskGrid = { get: () => 1 };

describe("export quality helpers", () => {
  it("uses dt=0 for the first exported frame", () => {
    expect(getFrameTime(0, 30)).toBe(0);
    expect(getFrameDelta(0, 30)).toBe(0);
    expect(getFrameTime(3, 30)).toBeCloseTo(0.1);
    expect(getFrameDelta(3, 30)).toBeCloseTo(1 / 30);
  });

  it("maps video export frames to scene duration instead of render time", () => {
    const fps = 24;
    const duration = 10;
    const totalFrames = Math.round(duration * fps);
    const lastTimestamp = getFrameTime(totalFrames - 1, fps);

    expect(totalFrames).toBe(240);
    expect(lastTimestamp).toBeCloseTo(duration - 1 / fps);
  });

  it("includes letter spacing in exported character advance", () => {
    expect(calculateCharAdvance(8, "0px", 10)).toBe(8);
    expect(calculateCharAdvance(8, "2px", 10)).toBe(10);
    expect(calculateCharAdvance(8, "0.2em", 10)).toBe(10);
  });

  it("tracks only applyToAscii cells as base-text holes", () => {
    const holes = collectAsciiOverlayHoles([
      { row: 0, col: 1, asciiOverlay: true },
      { row: 0, col: 2 },
    ], 2, 4);

    expect(holes.has(1)).toBe(true);
    expect(holes.has(2)).toBe(false);
  });

  it("collectAsciiOverlayHoles handles corners, empty input, and the glowCount cap", () => {
    expect(collectAsciiOverlayHoles([], 0, 10).size).toBe(0);

    const corners = collectAsciiOverlayHoles([
      { row: 0, col: 0, asciiOverlay: true },
      { row: 4, col: 9, asciiOverlay: true },
    ], 2, 10);
    expect(corners.has(0)).toBe(true);
    expect(corners.has(49)).toBe(true);

    // Cells beyond glowCount are pool leftovers and must be ignored
    const capped = collectAsciiOverlayHoles([
      { row: 0, col: 1, asciiOverlay: true },
      { row: 0, col: 2, asciiOverlay: true },
    ], 1, 10);
    expect(capped.size).toBe(1);
    expect(capped.has(1)).toBe(true);
  });

  it("creates measurable export estimates and finished metrics", () => {
    const estimate = estimateExportCost({ width: 640, height: 360, fps: 12, duration: 2 });
    expect(estimate.frameCount).toBe(24);
    expect(estimate.pixelCount).toBe(230_400);

    const started = createExportMetrics({
      format: "gif",
      width: 640,
      height: 360,
      fps: 12,
      duration: 2,
      startedAt: 100,
    });
    const finished = finishExportMetrics(started, { endedAt: 350, bytes: 2048 });
    expect(finished.elapsedMs).toBe(250);
    expect(finished.bytes).toBe(2048);
    expect(formatBytes(finished.bytes)).toBe("2 KB");
  });

  it("keeps GIF presets smaller than video presets by default", () => {
    const gif = resolveGifPreset("preview");
    const video = resolveVideoPreset("high");

    expect(gif.targetHeight).toBeLessThanOrEqual(320);
    expect(gif.fps).toBeLessThanOrEqual(8);
    expect(gif.fps).toBeLessThan(video.fps);
    expect(gif.maxColors).toBeLessThanOrEqual(32);
    expect(gif.maxDuration).toBeLessThanOrEqual(3);
    expect(video.videoBitsPerSecond).toBeGreaterThan(2_000_000);
  });

  it("caps GIF preview frame count independently of scene duration", () => {
    const gif = resolveGifPreset("preview");

    expect(getGifDuration(10, gif.maxDuration)).toBe(3);
    expect(getGifFrameCount(10, gif.fps, gif.maxDuration)).toBeLessThanOrEqual(24);
  });

  it("only quantizes per-frame in local palette mode (global palette is pre-sampled)", () => {
    expect(shouldQuantizeGifFrame(0, "global")).toBe(false);
    expect(shouldQuantizeGifFrame(1, "global")).toBe(false);
    expect(shouldQuantizeGifFrame(0, "local")).toBe(true);
    expect(shouldQuantizeGifFrame(1, "local")).toBe(true);
  });

  it("spreads palette sample frames across the whole timeline", () => {
    expect(pickPaletteSampleFrames(1, 5)).toEqual([0]);
    expect(pickPaletteSampleFrames(2, 5)).toEqual([0, 1]);
    const picks = pickPaletteSampleFrames(30, 5);
    expect(picks).toEqual([0, 7, 15, 22, 29]);
    expect(pickPaletteSampleFrames(100, 1)).toEqual([0]);
  });

  it("renders plain text and ANSI frames from the compositor", () => {
    const fx = new StubEffect([{ row: 1, col: 2, char: "*", brightness: 1, color: "#ff0000" }]);
    const active = makeActive(fx);

    const plain = renderPlainTextFrame([active], grid, mask, "", 0, 0);
    const ansi = renderAnsiFrame([active], grid, mask, "", 0, 0);

    expect(plain.split("\n")[1][2]).toBe("*");
    expect(stripAnsi(ansi)).toBe(plain);
    expect(ansi).toContain("\u001b[38;2;255;0;0m");
  });

  it("renders terminal text frames with the base ASCII layer underneath effects", () => {
    const fx = new StubEffect([{ row: 0, col: 1, char: "*", brightness: 1 }]);
    const active = makeActive(fx);

    expect(renderTerminalTextFrame([active], grid, mask, "abcd\nefgh", 0, 0)).toBe("a*cd\nefgh");
  });

  it("renders apply-to-ASCII cells as colored base characters in ANSI frames", () => {
    const fx = new StubEffect([{ row: 0, col: 1, char: "X", brightness: 1, color: "#00ff00" }]);
    const active = makeActive(fx);
    active.applyToAscii = true;

    const ansi = renderTerminalAnsiFrame([active], grid, mask, "abcd\nefgh", 0, 0);

    expect(stripAnsi(ansi)).toBe("abcd\nefgh");
    expect(ansi).toContain("\u001b[38;2;0;255;0m");
  });
});
