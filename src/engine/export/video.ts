import type { SceneData } from "../scene";
import type { Mask } from "../mask";
import type { GridInfo, MaskGrid } from "../effects/types";
import { imageToAscii } from "../ascii";
import { compositeFrame, type ActiveEffect } from "../renderer";
import { createEffect } from "../effects";
import { getGlowSprite } from "../glow-cache";

// ---------------------------------------------------------------------------
// Shared helpers (also used by gif.ts)
// ---------------------------------------------------------------------------

export function parseColor(color: string): [number, number, number, number] | null {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
        1,
      ];
    }
    if (hex.length >= 6) {
      const a = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        a,
      ];
    }
  }
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/);
  if (m) return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), m[4] ? parseFloat(m[4]) : 1];
  return null;
}

export function parseFontSize(fontSize: string, canvasWidth: number): number {
  if (fontSize.endsWith("vw")) return (parseFloat(fontSize) / 100) * canvasWidth;
  if (fontSize.endsWith("px")) return parseFloat(fontSize);
  return parseFloat(fontSize) || 12;
}

export function measureCharDimensions(
  fontSize: number,
  fontFamily: string,
  lineHeight: number,
): { charW: number; charH: number } {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const cx = c.getContext("2d")!;
  cx.font = `700 ${fontSize}px ${fontFamily}`;
  const measured = cx.measureText("X".repeat(20));
  return { charW: measured.width / 20, charH: fontSize * lineHeight };
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
) {
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;
  const imgAspect = imgW / imgH;
  const canvasAspect = w / h;
  let sx = 0, sy = 0, sw = imgW, sh = imgH;
  if (imgAspect > canvasAspect) {
    sw = imgH * canvasAspect;
    sx = (imgW - sw) / 2;
  } else {
    sh = imgW / canvasAspect;
    sy = (imgH - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

// ---------------------------------------------------------------------------
// Scene preparation — shared by all export formats
// ---------------------------------------------------------------------------

export interface ExportContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  grid: GridInfo;
  baseText: string;
  baseLines: string[];
  maskGrid: MaskGrid;
  activeEffects: ActiveEffect[];
  asciiColorRgb: number[];
  asciiOpacity: number;
  asciiBlendMode: string;
  fontSize: number;
  fontFamily: string;
  image: HTMLImageElement;
  width: number;
  height: number;
}

export async function prepareExportContext(
  scene: SceneData,
  image: HTMLImageElement,
  mask: Mask | null,
  width: number,
  height: number,
): Promise<ExportContext> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const fontSize = parseFontSize(scene.ascii.fontSize, width);
  const fontFamily = scene.ascii.fontFamily;
  const { charW, charH } = measureCharDimensions(fontSize, fontFamily, scene.ascii.lineHeight);

  const cols = Math.floor(width / charW);
  const rows = Math.floor(height / charH);
  const padX = (width - cols * charW) / 2;
  const padY = (height - rows * charH) / 2;
  const grid: GridInfo = { cols, rows, charW, charH, fontSize, padX, padY };

  const baseText = imageToAscii(image, grid, { ramp: scene.ascii.ramp });

  const emptyMask: MaskGrid = { get: () => 1 };
  let maskGrid: MaskGrid = emptyMask;
  if (mask) {
    maskGrid = mask.toGrid(grid, image.naturalWidth, image.naturalHeight);
  } else if (scene.mask?.data) {
    try {
      const { Mask: MaskClass } = await import("../mask");
      const decoded = await MaskClass.fromBase64(scene.mask.data, image.naturalWidth, image.naturalHeight);
      maskGrid = decoded.toGrid(grid, image.naturalWidth, image.naturalHeight);
    } catch {
      maskGrid = emptyMask;
    }
  }

  const activeEffects: ActiveEffect[] = [];
  for (const cfg of scene.effects) {
    if (!cfg.enabled) continue;
    try {
      const instance = createEffect(cfg.type);
      instance.init(grid, cfg.params || {});
      if ("setBaseText" in instance && typeof (instance as Record<string, unknown>).setBaseText === "function") {
        (instance as unknown as { setBaseText: (t: string) => void }).setBaseText(baseText);
      }
      activeEffects.push({
        instance,
        maskRegion: cfg.maskRegion || "both",
        enabled: true,
        timelineStart: cfg.timeline.start,
        timelineEnd: cfg.timeline.end,
        mode: cfg.timeline.mode || "continuous",
        applyToAscii: cfg.applyToAscii ?? false,
      });
    } catch { /* skip unknown effects */ }
  }

  const asciiParsed = parseColor(scene.ascii.color) ?? [220, 230, 255, 0.38];
  const asciiColorRgb = asciiParsed.slice(0, 3);
  const asciiOpacity = asciiParsed[3] * (scene.ascii.opacity ?? 1);

  return {
    canvas, ctx, grid, baseText, baseLines: baseText.split("\n"),
    maskGrid, activeEffects, asciiColorRgb, asciiOpacity,
    asciiBlendMode: scene.ascii.blendMode || "screen",
    fontSize, fontFamily, image, width, height,
  };
}

// ---------------------------------------------------------------------------
// Render a single frame to the export canvas
// ---------------------------------------------------------------------------

export function renderFrame(ec: ExportContext, dt: number, time: number): void {
  const { ctx, width, height, image, grid, baseLines, asciiColorRgb, asciiOpacity, asciiBlendMode, fontSize, fontFamily, activeEffects, maskGrid, baseText } = ec;
  const { rows, charW, charH, padX, padY } = grid;

  ctx.clearRect(0, 0, width, height);

  // 1. Background image
  drawImageCover(ctx, image, width, height);

  // 2. Vignette
  const corners: [number, number][] = [[0, 0], [width, 0], [0, height], [width, height]];
  const r = Math.max(width, height) * 0.5;
  for (const [cx, cy] of corners) {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, "rgba(0,0,0,0.45)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  // 3. ASCII text
  ctx.save();
  ctx.font = `700 ${fontSize}px ${fontFamily}`;
  ctx.textBaseline = "top";
  ctx.globalCompositeOperation = asciiBlendMode as GlobalCompositeOperation;
  ctx.fillStyle = `rgba(${asciiColorRgb[0]},${asciiColorRgb[1]},${asciiColorRgb[2]},${asciiOpacity})`;
  ctx.shadowColor = "rgba(255,255,255,0.04)";
  ctx.shadowBlur = 8;
  for (let row = 0; row < rows; row++) {
    const line = baseLines[row];
    if (!line) continue;
    ctx.fillText(line, padX!, padY! + row * charH);
  }
  ctx.restore();

  // 4. Effects
  const { glowCells, glowCount } = compositeFrame(activeEffects, dt, time, maskGrid, grid, baseText);

  if (glowCount > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";

    // Glow sprites
    for (let i = 0; i < glowCount; i++) {
      const cell = glowCells[i];
      const rgb = parseColor(cell.color);
      if (!rgb) continue;
      const brightness = cell.brightness ?? 0.5;
      const glowRadius = cell.glowRadius ?? (4 + 14 * brightness);
      if (glowRadius <= 0) continue;
      const x = padX! + cell.col * charW + charW * 0.5;
      const y = padY! + cell.row * charH + charH * 0.5;
      const sprite = getGlowSprite(rgb[0], rgb[1], rgb[2], glowRadius, brightness);
      ctx.drawImage(sprite, x - glowRadius, y - glowRadius, glowRadius * 2, glowRadius * 2);
    }

    // Effect text
    ctx.font = `700 ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = "top";
    for (let i = 0; i < glowCount; i++) {
      const cell = glowCells[i];
      const rgb = parseColor(cell.color);
      if (!rgb) continue;
      const brightness = cell.brightness ?? 0.5;
      ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      ctx.globalAlpha = Math.min(1, brightness * 0.95);
      ctx.fillText(cell.char, padX! + cell.col * charW, padY! + cell.row * charH);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// WebM export via MediaRecorder
// ---------------------------------------------------------------------------

export interface VideoExportOptions {
  width: number;
  height: number;
  onProgress?: (pct: number) => void;
}

export async function exportWebM(
  scene: SceneData,
  image: HTMLImageElement,
  mask: Mask | null,
  options: VideoExportOptions,
): Promise<{ blob: Blob; ext: string }> {
  const { width, height, onProgress } = options;
  const ec = await prepareExportContext(scene, image, mask, width, height);

  const fps = scene.playback.fps || 30;
  const duration = scene.playback.duration || 10;
  const totalFrames = Math.round(duration * fps);
  const dt = 1 / fps;

  // Use captureStream + MediaRecorder for hardware-accelerated encoding
  const stream = ec.canvas.captureStream(0); // 0 = manual frame capture

  // Pick best supported codec — Safari lacks VP9/WebM support
  const codecs = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4;codecs=avc1",
    "video/mp4",
  ];
  const mimeType = codecs.find((c) => MediaRecorder.isTypeSupported(c));
  if (!mimeType) throw new Error("No supported video codec found in this browser");

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 2_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  const done = new Promise<{ blob: Blob; ext: string }>((resolve) => {
    recorder.onstop = () => resolve({ blob: new Blob(chunks, { type: mimeType }), ext });
  });

  recorder.start();

  for (let f = 0; f < totalFrames; f++) {
    const time = f * dt;
    renderFrame(ec, dt, time);

    // Request a frame capture from the stream
    const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
    track.requestFrame?.();

    // Yield to keep UI responsive
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    onProgress?.(f / totalFrames);
  }

  recorder.stop();
  onProgress?.(1);
  return done;
}
