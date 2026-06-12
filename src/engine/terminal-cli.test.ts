import { describe, expect, it } from "vitest";
import { formatTerminalTuiScreen, parseTerminalCliArgs, renderTerminalStill } from "./terminal-cli";
import { createDefaultScene } from "./scene";

describe("terminal CLI helpers", () => {
  it("parses render command options", () => {
    expect(parseTerminalCliArgs([
      "render",
      "--scene",
      "demo.txtfx",
      "--image",
      "photo.png",
      "--text",
      "ascii.txt",
      "--time",
      "2.5",
      "--cols",
      "20",
      "--rows",
      "5",
      "--ansi",
    ])).toMatchObject({
      command: "render",
      scenePath: "demo.txtfx",
      imagePath: "photo.png",
      textPath: "ascii.txt",
      time: 2.5,
      cols: 20,
      rows: 5,
      ansi: true,
    });
  });

  it("renders a still frame from a scene and text base", () => {
    const scene = createDefaultScene();

    expect(renderTerminalStill(scene, {
      baseText: "abc",
      cols: 3,
      rows: 1,
      time: 0,
      ansi: false,
    })).toBe("abc");
  });

  it("formats a TUI preview screen around a rendered frame", () => {
    const screen = formatTerminalTuiScreen({
      frame: "abc\ndef",
      effectLabels: ["Matrix Rain"],
      time: 1.25,
      duration: 10,
      fps: 30,
      playing: true,
      cols: 72,
      rows: 10,
    });

    expect(screen).toContain("txtfx terminal");
    expect(screen).toContain("Matrix Rain");
    expect(screen).toContain("1.25s / 10.00s");
    expect(screen).toContain("space play/pause");
  });
});
