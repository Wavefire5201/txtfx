import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { createDefaultScene, deserializeScene, type SceneData } from "./scene";
import { EFFECT_LABELS } from "./effects";
import type { EffectType } from "./effects/types";
import { imagePixelsToTerminalBaseText, prepareTerminalContext } from "./terminal";
import { renderTerminalAnsiFrame, renderTerminalTextFrame, stripAnsi } from "./export/text";

export type TerminalCliCommand = "render" | "play" | "tui";

export interface TerminalCliOptions {
  command: TerminalCliCommand;
  scenePath?: string;
  imagePath?: string;
  textPath?: string;
  effect?: EffectType;
  time: number;
  cols: number;
  rows: number;
  fps?: number;
  frames?: number;
  ansi: boolean;
  loop: boolean;
}

export interface RenderTerminalStillOptions {
  baseText?: string;
  cols: number;
  rows: number;
  time: number;
  ansi: boolean;
}

export interface TerminalTuiScreenOptions {
  frame: string;
  effectLabels: string[];
  time: number;
  duration: number;
  fps: number;
  playing: boolean;
  cols: number;
  rows: number;
}

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const DEFAULT_FPS = 30;

export function parseTerminalCliArgs(argv: string[]): TerminalCliOptions {
  const args = [...argv];
  const first = args[0];
  const command: TerminalCliCommand =
    first === "render" || first === "play" || first === "tui"
      ? (args.shift() as TerminalCliCommand)
      : "render";

  const options: TerminalCliOptions = {
    command,
    time: 0,
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    ansi: false,
    loop: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--scene":
        options.scenePath = readValue(args, ++i, arg);
        break;
      case "--image":
        options.imagePath = readValue(args, ++i, arg);
        break;
      case "--text":
        options.textPath = readValue(args, ++i, arg);
        break;
      case "--effect":
        options.effect = readValue(args, ++i, arg) as EffectType;
        break;
      case "--time":
        options.time = readNumber(args, ++i, arg);
        break;
      case "--cols":
        options.cols = readPositiveInt(args, ++i, arg);
        break;
      case "--rows":
        options.rows = readPositiveInt(args, ++i, arg);
        break;
      case "--fps":
        options.fps = readPositiveInt(args, ++i, arg);
        break;
      case "--frames":
        options.frames = readPositiveInt(args, ++i, arg);
        break;
      case "--ansi":
        options.ansi = true;
        break;
      case "--plain":
        options.ansi = false;
        break;
      case "--loop":
        options.loop = true;
        break;
      case "--help":
      case "-h":
        throw new Error(helpText());
      default:
        throw new Error(`Unknown option: ${arg}\n\n${helpText()}`);
    }
  }

  return options;
}

export function renderTerminalStill(scene: SceneData, options: RenderTerminalStillOptions): string {
  const context = prepareTerminalContext(scene, {
    cols: options.cols,
    rows: options.rows,
    baseText: options.baseText,
  });

  return options.ansi
    ? renderTerminalAnsiFrame(context.effects, context.grid, context.mask, context.baseText, options.time, 0)
    : renderTerminalTextFrame(context.effects, context.grid, context.mask, context.baseText, options.time, 0);
}

export async function runTerminalCli(argv: string[]): Promise<number> {
  let options: TerminalCliOptions;
  try {
    options = parseTerminalCliArgs(argv);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("Usage:")) {
      process.stdout.write(`${message}\n`);
      return 0;
    }
    process.stderr.write(`${message}\n`);
    return 1;
  }

  try {
    const scene = await loadScene(options);
    const baseText = await loadBaseText(options);

    if (options.command === "render") {
      process.stdout.write(renderTerminalStill(scene, {
        baseText,
        cols: options.cols,
        rows: options.rows,
        time: options.time,
        ansi: options.ansi,
      }));
      process.stdout.write("\n");
      return 0;
    }

    if (options.command === "tui") {
      await playTerminalTui(scene, baseText, options);
    } else {
      await playTerminalScene(scene, baseText, options);
    }
    return 0;
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

export function formatTerminalTuiScreen(options: TerminalTuiScreenOptions): string {
  const cols = Math.max(24, options.cols);
  const rows = Math.max(8, options.rows);
  const sidebarWidth = Math.min(24, Math.max(16, Math.floor(cols * 0.32)));
  const viewportWidth = Math.max(8, cols - sidebarWidth - 5);
  const viewportHeight = Math.max(1, rows - 5);
  const top = `+${"-".repeat(viewportWidth + 2)}+${"-".repeat(sidebarWidth)}+`;
  const title = `| ${padVisible("txtfx terminal", viewportWidth)} |${padVisible(options.playing ? " playing" : " paused", sidebarWidth)}|`;
  const split = `+${"-".repeat(viewportWidth + 2)}+${"-".repeat(sidebarWidth)}+`;
  const frameLines = options.frame.split("\n");
  const effectLines = [
    "Effects",
    ...(
      options.effectLabels.length > 0
        ? options.effectLabels.map((label, i) => `${i + 1}. ${label}`)
        : ["none"]
    ),
    "",
    `${options.fps} fps`,
  ];
  const body: string[] = [];

  for (let row = 0; row < viewportHeight; row++) {
    const frame = padVisible(frameLines[row] ?? "", viewportWidth);
    const side = padVisible(effectLines[row] ?? "", sidebarWidth);
    body.push(`| ${frame} |${side}|`);
  }

  const status = `${options.time.toFixed(2)}s / ${options.duration.toFixed(2)}s`;
  const keys = "space play/pause | arrows seek | r restart | q quit";
  const footer = `| ${padVisible(`${status} | ${keys}`, cols - 4)} |`;
  const bottom = `+${"-".repeat(cols - 2)}+`;

  return [top, title, split, ...body, bottom, footer, bottom].slice(0, rows).join("\n");
}

async function loadScene(options: TerminalCliOptions): Promise<SceneData> {
  const scene = options.scenePath
    ? deserializeScene(await readFile(options.scenePath, "utf8"))
    : createDefaultScene();

  if (!options.effect) return scene;

  return {
    ...scene,
    effects: [
      ...scene.effects,
      {
        id: `${options.effect}-terminal`,
        type: options.effect,
        enabled: true,
        maskRegion: "both",
        params: {},
        timeline: { start: 0, end: null, mode: "continuous" },
        applyToAscii: false,
      },
    ],
  };
}

async function loadBaseText(options: TerminalCliOptions): Promise<string | undefined> {
  if (options.textPath) {
    if (options.textPath === "-") return readStdin();
    return readFile(options.textPath, "utf8");
  }
  return loadImageBaseText(options);
}

async function loadImageBaseText(options: TerminalCliOptions): Promise<string | undefined> {
  if (!options.imagePath) return undefined;
  const { data, info } = await sharp(options.imagePath)
    .resize(options.cols, options.rows, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return imagePixelsToTerminalBaseText({
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  }, {
    cols: options.cols,
    rows: options.rows,
  });
}

async function playTerminalScene(
  scene: SceneData,
  baseText: string | undefined,
  options: TerminalCliOptions,
): Promise<void> {
  const fps = options.fps ?? scene.playback.fps ?? DEFAULT_FPS;
  const frameDurationMs = 1000 / fps;
  const context = prepareTerminalContext(scene, {
    cols: options.cols,
    rows: options.rows,
    baseText,
  });
  const maxFrames = options.frames ?? Math.ceil(context.duration * fps);
  let lastTime = 0;

  for (let frame = 0; options.loop || frame < maxFrames; frame++) {
    const time = options.loop && context.duration > 0
      ? (frame / fps) % context.duration
      : frame / fps;
    const dt = frame === 0 || time < lastTime ? 0 : time - lastTime;
    lastTime = time;
    const rendered = options.ansi
      ? renderTerminalAnsiFrame(context.effects, context.grid, context.mask, context.baseText, time, dt)
      : renderTerminalTextFrame(context.effects, context.grid, context.mask, context.baseText, time, dt);

    process.stdout.write("\u001b[H\u001b[2J");
    process.stdout.write(rendered);
    process.stdout.write(`\n\n${time.toFixed(2)}s / ${context.duration.toFixed(2)}s`);
    await sleep(frameDurationMs);
  }
}

async function playTerminalTui(
  scene: SceneData,
  baseText: string | undefined,
  options: TerminalCliOptions,
): Promise<void> {
  const fps = options.fps ?? scene.playback.fps ?? DEFAULT_FPS;
  const totalCols = options.cols;
  const totalRows = options.rows;
  const sidebarWidth = Math.min(24, Math.max(16, Math.floor(Math.max(24, totalCols) * 0.32)));
  const viewportCols = Math.max(8, totalCols - sidebarWidth - 5);
  const viewportRows = Math.max(1, totalRows - 5);
  const context = prepareTerminalContext(scene, {
    cols: viewportCols,
    rows: viewportRows,
    baseText,
  });
  const labels = context.effects.map((fx) => {
    const type = fx.instance.type as EffectType;
    return EFFECT_LABELS[type]?.label ?? fx.instance.type;
  });
  const frameDurationMs = 1000 / fps;
  const maxFrames = options.frames ?? Math.ceil(context.duration * fps);
  const input = process.stdin;
  let frame = Math.max(0, Math.floor(options.time * fps));
  let playing = true;
  let quit = false;

  const onKey = (chunk: Buffer) => {
    const key = chunk.toString("utf8");
    if (key === "q" || key === "\u0003") quit = true;
    if (key === " ") playing = !playing;
    if (key === "r") frame = 0;
    if (key === "\u001b[D") frame = Math.max(0, frame - fps);
    if (key === "\u001b[C") frame += fps;
  };

  if (input.isTTY) {
    input.setRawMode(true);
    input.resume();
    input.on("data", onKey);
  }

  try {
    let renderedFrames = 0;
    while (!quit && (options.loop || renderedFrames < maxFrames)) {
      const time = context.duration > 0 ? (frame / fps) % context.duration : 0;
      const rendered = options.ansi
        ? renderTerminalAnsiFrame(context.effects, context.grid, context.mask, context.baseText, time, playing ? 1 / fps : 0)
        : renderTerminalTextFrame(context.effects, context.grid, context.mask, context.baseText, time, playing ? 1 / fps : 0);
      process.stdout.write("\u001b[H\u001b[2J");
      process.stdout.write(formatTerminalTuiScreen({
        frame: rendered,
        effectLabels: labels,
        time,
        duration: context.duration,
        fps,
        playing,
        cols: totalCols,
        rows: totalRows,
      }));

      await sleep(frameDurationMs);
      if (playing) frame++;
      renderedFrames++;
    }
  } finally {
    if (input.isTTY) {
      input.off("data", onKey);
      input.setRawMode(false);
      input.pause();
    }
    process.stdout.write("\u001b[0m\n");
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
  return value;
}

function readNumber(args: string[], index: number, flag: string): number {
  const value = Number(readValue(args, index, flag));
  if (!Number.isFinite(value)) throw new Error(`Invalid number for ${flag}`);
  return value;
}

function readPositiveInt(args: string[], index: number, flag: string): number {
  const value = Math.floor(readNumber(args, index, flag));
  if (value < 1) throw new Error(`${flag} must be at least 1`);
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function padVisible(value: string, width: number): string {
  const raw = stripAnsi(value);
  if (raw.length > width) {
    let out = "";
    let visible = 0;
    for (let i = 0; i < value.length && visible < width; i++) {
      const ch = value[i];
      if (ch === "\u001b") {
        const end = value.indexOf("m", i);
        if (end === -1) break;
        out += value.slice(i, end + 1);
        i = end;
        continue;
      }
      out += ch;
      visible++;
    }
    return out;
  }
  return value + " ".repeat(width - raw.length);
}

function helpText(): string {
  return `Usage: bun scripts/txtfx-terminal.ts <render|play|tui> [options]

Options:
  --scene <file.txtfx>   Load a txtfx scene JSON file
  --image <file>         Convert an image file into the base ASCII layer
  --text <file|->        Use a text file or stdin as the base ASCII layer
  --effect <type>        Add one effect when no scene is supplied
  --time <seconds>       Render time for still frames
  --cols <n>             Terminal grid columns (default ${DEFAULT_COLS})
  --rows <n>             Terminal grid rows (default ${DEFAULT_ROWS})
  --fps <n>              Playback FPS
  --frames <n>           Playback frame limit
  --ansi                 Use 24-bit ANSI colors
  --plain                Disable ANSI colors
  --loop                 Loop playback until interrupted`;
}
