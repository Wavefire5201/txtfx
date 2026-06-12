import { describe, expect, it } from "vitest";
import { CellBuffer, cellBufferToArray } from "./cell-buffer";
import type { SceneData } from "./scene";
import { createDefaultScene } from "./scene";
import { fitTerminalBaseText, imagePixelsToTerminalBaseText, prepareTerminalContext } from "./terminal";

function makeScene(overrides: Partial<SceneData> = {}): SceneData {
  const base = createDefaultScene();
  return {
    ...base,
    ...overrides,
    playback: { ...base.playback, ...overrides.playback },
    ascii: { ...base.ascii, ...overrides.ascii },
  };
}

describe("terminal render context", () => {
  it("fits text input to the fixed terminal grid", () => {
    expect(fitTerminalBaseText("abcde\nxy", { cols: 3, rows: 3 })).toBe("abc\nxy \n   ");
  });

  it("prepares active effects and feeds base text for terminal rendering", () => {
    const scene = makeScene({
      effects: [
        {
          id: "typewriter-1",
          type: "typewriter",
          enabled: true,
          maskRegion: "both",
          params: { speed: 1000, cursor: "_" },
          timeline: { start: 0, end: null, mode: "continuous" },
          applyToAscii: false,
        },
      ],
    });

    const context = prepareTerminalContext(scene, {
      cols: 4,
      rows: 1,
      baseText: "abcd",
    });

    expect(context.grid).toMatchObject({ cols: 4, rows: 1 });
    expect(context.baseText).toBe("abcd");
    expect(context.duration).toBe(scene.playback.duration);
    expect(context.fps).toBe(scene.playback.fps);
    expect(context.effects).toHaveLength(1);
    expect(context.effects[0]).toMatchObject({
      enabled: true,
      timelineStart: 0,
      timelineEnd: null,
      mode: "continuous",
      applyToAscii: false,
    });

    const buf = new CellBuffer();
    context.effects[0].instance.update(0, 0.01, context.mask, buf);
    expect(cellBufferToArray(buf).some((cell) => cell.char === "a")).toBe(true);
  });

  it("maps image luminance pixels to terminal ASCII", () => {
    expect(imagePixelsToTerminalBaseText({
      data: new Uint8Array([
        0, 0, 0, 255,
        255, 255, 255, 255,
      ]),
      width: 2,
      height: 1,
    }, { cols: 2, rows: 1 }, " @")).toBe("@ ");
  });
});
