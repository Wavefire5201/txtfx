import { createEffect } from "./effects";
import type { GridInfo, MaskGrid } from "./effects/types";
import type { SceneData } from "./scene";
import type { ActiveEffect } from "./renderer";
import type { DecodeEffect } from "./effects/decode";
import type { TypewriterEffect } from "./effects/typewriter";

const EMPTY_MASK: MaskGrid = { get: () => 1 };
const DEFAULT_PLACEHOLDER_RAMP = " .`,:;cbaO0%#@";

export interface TerminalGridOptions {
  cols: number;
  rows: number;
}

export interface TerminalContextOptions extends TerminalGridOptions {
  baseText?: string;
  placeholderRamp?: string;
}

export interface TerminalRenderContext {
  grid: GridInfo;
  mask: MaskGrid;
  baseText: string;
  effects: ActiveEffect[];
  duration: number;
  fps: number;
  loop: boolean;
}

export interface TerminalImagePixels {
  data: Uint8Array;
  width: number;
  height: number;
  channels?: number;
}

export function createTerminalGrid({ cols, rows }: TerminalGridOptions): GridInfo {
  return {
    cols: Math.max(1, Math.floor(cols)),
    rows: Math.max(1, Math.floor(rows)),
    charW: 1,
    charH: 1,
    fontSize: 1,
  };
}

export function fitTerminalBaseText(text: string, { cols, rows }: TerminalGridOptions): string {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const fitted: string[] = [];

  for (let row = 0; row < rows; row++) {
    const line = lines[row] ?? "";
    fitted.push(line.slice(0, cols).padEnd(cols, " "));
  }

  return fitted.join("\n");
}

export function createPlaceholderBaseText(
  { cols, rows }: TerminalGridOptions,
  ramp = DEFAULT_PLACEHOLDER_RAMP,
): string {
  const chars = ramp.length > 0 ? ramp : DEFAULT_PLACEHOLDER_RAMP;
  const lines: string[] = [];

  for (let row = 0; row < rows; row++) {
    let line = "";
    for (let col = 0; col < cols; col++) {
      const x = cols <= 1 ? 0 : col / (cols - 1);
      const y = rows <= 1 ? 0 : row / (rows - 1);
      const idx = Math.floor(((x + y) / 2) * (chars.length - 1));
      line += chars[idx];
    }
    lines.push(line);
  }

  return lines.join("\n");
}

export function imagePixelsToTerminalBaseText(
  image: TerminalImagePixels,
  { cols, rows }: TerminalGridOptions,
  ramp = DEFAULT_PLACEHOLDER_RAMP,
): string {
  const chars = ramp.length > 0 ? ramp : DEFAULT_PLACEHOLDER_RAMP;
  const channels = image.channels ?? inferChannels(image);
  const lines: string[] = [];

  for (let row = 0; row < rows; row++) {
    let line = "";
    const y = Math.min(image.height - 1, Math.floor((row / rows) * image.height));
    for (let col = 0; col < cols; col++) {
      const x = Math.min(image.width - 1, Math.floor((col / cols) * image.width));
      const idx = (y * image.width + x) * channels;
      const lum = channels === 1
        ? image.data[idx] / 255
        : (0.299 * image.data[idx] + 0.587 * image.data[idx + 1] + 0.114 * image.data[idx + 2]) / 255;
      line += chars[Math.floor((1 - lum) * (chars.length - 1))];
    }
    lines.push(line);
  }

  return lines.join("\n");
}

export function prepareTerminalContext(
  scene: SceneData,
  options: TerminalContextOptions,
): TerminalRenderContext {
  const grid = createTerminalGrid(options);
  const baseText = fitTerminalBaseText(
    options.baseText ?? createPlaceholderBaseText(grid, options.placeholderRamp ?? scene.ascii.ramp),
    grid,
  );
  const effects = scene.effects
    .filter((cfg) => cfg.enabled)
    .map((cfg): ActiveEffect => {
      const instance = createEffect(cfg.type);
      instance.init(grid, cfg.params);
      feedBaseText(instance, baseText);

      return {
        instance,
        maskRegion: cfg.maskRegion,
        enabled: cfg.enabled,
        timelineStart: cfg.timeline.start,
        timelineEnd: cfg.timeline.end,
        mode: cfg.timeline.mode ?? "continuous",
        applyToAscii: cfg.applyToAscii ?? false,
      };
    });

  return {
    grid,
    mask: EMPTY_MASK,
    baseText,
    effects,
    duration: scene.playback.duration,
    fps: scene.playback.fps,
    loop: scene.playback.loop,
  };
}

function feedBaseText(instance: ActiveEffect["instance"], baseText: string): void {
  if ("setBaseText" in instance && typeof (instance as TypewriterEffect | DecodeEffect).setBaseText === "function") {
    (instance as TypewriterEffect | DecodeEffect).setBaseText(baseText);
  }
}

function inferChannels(image: TerminalImagePixels): number {
  const pixels = image.width * image.height;
  if (pixels > 0 && image.data.length % pixels === 0) {
    return Math.max(1, image.data.length / pixels);
  }
  return 4;
}
