import type { SceneData } from "../scene";
import type { Mask } from "../mask";
import type { GridInfo, MaskGrid } from "../effects/types";
import { imageToAscii, sampleMeanColor } from "../ascii";
import { compositeFrame, type ActiveEffect } from "../renderer";
import { createEffect } from "../effects";
import { getGlowSprite } from "../glow-cache";
import {
  createAnyCanvas,
  get2d,
  getImageSize,
  canvasToBlob,
  normalizeToCanvasSource,
  type AnyCanvas,
  type AnyCtx2D,
  type ImageLike,
} from "../canvas-util";
import { macrotaskYield } from "./scheduling";
import { withSeed } from "../prng";
import {
  createExportMetrics,
  finishExportMetrics,
  type ExportMetrics,
} from "./diagnostics";

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

// Effect colors repeat heavily across cells and frames; parsing per cell per
// frame (twice — glow pass and text pass) showed up in profiles. Bounded memo:
// gradient color modes can emit a new lerped color every frame.
const _colorCache = new Map<string, [number, number, number, number] | null>();
export function parseColorCached(color: string): [number, number, number, number] | null {
  let value = _colorCache.get(color);
  if (value === undefined) {
    if (_colorCache.size >= 1024) _colorCache.clear();
    value = parseColor(color);
    _colorCache.set(color, value);
  }
  return value;
}

export function parseFontSize(fontSize: string, canvasWidth: number): number {
  if (fontSize.endsWith("vw")) return (parseFloat(fontSize) / 100) * canvasWidth;
  if (fontSize.endsWith("px")) return parseFloat(fontSize);
  return parseFloat(fontSize) || 12;
}

function parseSpacing(spacing: string | undefined, fontSize: number): number {
  if (!spacing) return 0;
  const value = parseFloat(spacing);
  if (!Number.isFinite(value)) return 0;
  if (spacing.endsWith("em")) return value * fontSize;
  if (spacing.endsWith("rem")) return value * 16;
  if (spacing.endsWith("px")) return value;
  return value;
}

export function calculateCharAdvance(
  measuredCharWidth: number,
  letterSpacing: string | undefined,
  fontSize: number,
): number {
  return measuredCharWidth + parseSpacing(letterSpacing, fontSize);
}

export function measureCharDimensions(
  fontSize: number,
  fontFamily: string,
  lineHeight: number,
  letterSpacing = "0px",
): { charW: number; charH: number } {
  const cx = get2d(createAnyCanvas(1, 1));
  cx.font = `700 ${fontSize}px ${fontFamily}`;
  const measured = cx.measureText("X".repeat(20));
  return {
    charW: calculateCharAdvance(measured.width / 20, letterSpacing, fontSize),
    charH: fontSize * lineHeight,
  };
}

function drawImageCover(
  ctx: AnyCtx2D,
  img: ImageLike,
  w: number,
  h: number,
) {
  const { width: imgW, height: imgH } = getImageSize(img);
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

function drawBackdrop(
  ctx: AnyCtx2D,
  image: ImageLike,
  width: number,
  height: number,
  imageOpacity = 1,
): void {
  if (imageOpacity < 1) {
    // Image dim setting: image at `opacity` over a dark mean-color tint —
    // identical semantics to the editor preview's backdrop treatment.
    const [r, g, b] = sampleMeanColor(image);
    ctx.fillStyle = `rgb(${(r * 0.5) | 0}, ${(g * 0.5) | 0}, ${(b * 0.5) | 0})`;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = imageOpacity;
    drawImageCover(ctx, image, width, height);
    ctx.globalAlpha = 1;
  } else {
    drawImageCover(ctx, image, width, height);
  }

  const corners: [number, number][] = [[0, 0], [width, 0], [0, height], [width, height]];
  const r = Math.max(width, height) * 0.5;
  for (const [cx, cy] of corners) {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, "rgba(0,0,0,0.45)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }
}

export function getFrameTime(frame: number, fps: number): number {
  return frame / fps;
}

export function getFrameDelta(frame: number, fps: number): number {
  return frame === 0 ? 0 : 1 / fps;
}

export function collectAsciiOverlayHoles(
  glowCells: Array<{ row: number; col: number; asciiOverlay?: boolean }>,
  glowCount: number,
  cols: number,
): Set<number> {
  const holes = new Set<number>();
  for (let i = 0; i < glowCount; i++) {
    const cell = glowCells[i];
    if (cell.asciiOverlay) holes.add(cell.row * cols + cell.col);
  }
  return holes;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw new DOMException("Export cancelled", "AbortError");
}

// ---------------------------------------------------------------------------
// Scene preparation — shared by all export formats
// ---------------------------------------------------------------------------

export interface ExportContext {
  canvas: AnyCanvas;
  ctx: AnyCtx2D;
  backdropCanvas: AnyCanvas;
  /** Base ASCII text pre-rendered once (the per-frame fillText+shadowBlur loop was the export bottleneck). */
  baseLayerCanvas: AnyCanvas;
  /** Scratch copy of baseLayerCanvas used to erase applyToAscii holes on frames that have them. */
  baseScratchCanvas: AnyCanvas;
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
  letterSpacing: string;
  image: ImageLike;
  width: number;
  height: number;
}

export interface PrepareExportOptions {
  /**
   * Pre-measured character cell size. Workers pass the main thread's
   * measurement so grid layout is identical even if the worker resolves the
   * font to a different face.
   */
  charMetrics?: { charW: number; charH: number };
}

export async function prepareExportContext(
  scene: SceneData,
  image: ImageLike,
  mask: Mask | null,
  width: number,
  height: number,
  options: PrepareExportOptions = {},
): Promise<ExportContext> {
  const canvas = createAnyCanvas(width, height);
  const ctx = get2d(canvas);
  const backdropCanvas = createAnyCanvas(width, height);
  const backdropCtx = get2d(backdropCanvas);

  const fontSize = parseFontSize(scene.ascii.fontSize, width);
  const fontFamily = scene.ascii.fontFamily;
  const letterSpacing = scene.ascii.letterSpacing || "0px";
  const { charW, charH } = options.charMetrics
    ?? measureCharDimensions(fontSize, fontFamily, scene.ascii.lineHeight, letterSpacing);

  // When layout metrics come from another realm (worker jobs), the local
  // font's natural advance may disagree — e.g. a generic family resolving to
  // a different face in the worker. Whole-row fillText would then drift off
  // the grid; per-cell drawing keeps every glyph in its cell.
  let fontAdvanceMatchesGrid = true;
  if (options.charMetrics) {
    const local = measureCharDimensions(fontSize, fontFamily, scene.ascii.lineHeight, letterSpacing);
    fontAdvanceMatchesGrid = Math.abs(local.charW - charW) < 0.01;
  }

  const cols = Math.floor(width / charW);
  const rows = Math.floor(height / charH);
  const padX = (width - cols * charW) / 2;
  const padY = (height - rows * charH) / 2;
  const grid: GridInfo = { cols, rows, charW, charH, fontSize, padX, padY };

  // One canvas-backed source for ascii sampling AND backdrop — deterministic
  // resampling regardless of whether the caller passed an element or pixels.
  const source = normalizeToCanvasSource(image);
  const baseText = imageToAscii(source, grid, { ramp: scene.ascii.ramp });

  const { width: imgW, height: imgH } = getImageSize(image);
  const emptyMask: MaskGrid = { get: () => 1 };
  let maskGrid: MaskGrid = emptyMask;
  if (mask) {
    maskGrid = mask.toGrid(grid, imgW, imgH);
  } else if (scene.mask?.data && typeof document !== "undefined") {
    // Base64 mask decoding needs DOM Image — workers receive a decoded Mask instead.
    try {
      const { Mask: MaskClass } = await import("../mask");
      const decoded = await MaskClass.fromBase64(scene.mask.data, imgW, imgH);
      maskGrid = decoded.toGrid(grid, imgW, imgH);
    } catch {
      maskGrid = emptyMask;
    }
  }

  const activeEffects: ActiveEffect[] = [];
  for (let i = 0; i < scene.effects.length; i++) {
    const cfg = scene.effects[i];
    if (!cfg.enabled) continue;
    try {
      const instance = createEffect(cfg.type);
      instance.init(grid, withSeed(cfg.params || {}, scene.seed, i));
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
  drawBackdrop(backdropCtx, source, width, height, scene.image.opacity ?? 0.86);

  const baseLines = baseText.split("\n");
  const baseLayerCanvas = createAnyCanvas(width, height);
  const baseScratchCanvas = createAnyCanvas(width, height);
  renderBaseLayer(
    baseLayerCanvas, grid, baseLines, asciiColorRgb, asciiOpacity,
    fontSize, fontFamily, letterSpacing,
    /* forcePerCell */ !fontAdvanceMatchesGrid,
  );

  return {
    canvas, ctx, backdropCanvas, baseLayerCanvas, baseScratchCanvas,
    grid, baseText, baseLines,
    maskGrid, activeEffects, asciiColorRgb, asciiOpacity,
    asciiBlendMode: scene.ascii.blendMode || "screen",
    fontSize, fontFamily, letterSpacing, image, width, height,
  };
}

/**
 * Renders the full styled base text once, into a transparent layer.
 * The layer is drawn unblended (source-over); the scene blend mode is applied
 * when the layer is composited onto the frame. This matches per-glyph blended
 * drawing everywhere except where neighboring glyph shadows overlap — the
 * shadow is rgba(255,255,255,0.04), so the divergence is sub-perceptual.
 */
function renderBaseLayer(
  canvas: AnyCanvas,
  grid: GridInfo,
  baseLines: string[],
  asciiColorRgb: number[],
  asciiOpacity: number,
  fontSize: number,
  fontFamily: string,
  letterSpacing: string,
  forcePerCell = false,
): void {
  const ctx = get2d(canvas);
  const { rows, charW, charH, padX, padY } = grid;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  setCanvasTextStyle(ctx, fontSize, fontFamily, letterSpacing);
  ctx.fillStyle = `rgba(${asciiColorRgb[0]},${asciiColorRgb[1]},${asciiColorRgb[2]},${asciiOpacity})`;
  ctx.shadowColor = "rgba(255,255,255,0.04)";
  ctx.shadowBlur = 8;
  const forceCellText = forcePerCell || parseSpacing(letterSpacing, fontSize) !== 0;
  for (let row = 0; row < rows; row++) {
    const line = baseLines[row];
    if (!line) continue;
    drawTextCells(
      ctx,
      line.padEnd(grid.cols, " ").slice(0, grid.cols),
      padX!,
      padY! + row * charH,
      charW,
      undefined,
      row,
      grid.cols,
      forceCellText,
    );
  }
}

// ---------------------------------------------------------------------------
// Render a single frame to the export canvas
// ---------------------------------------------------------------------------

function setCanvasTextStyle(
  ctx: AnyCtx2D,
  fontSize: number,
  fontFamily: string,
  letterSpacing: string,
): void {
  ctx.font = `700 ${fontSize}px ${fontFamily}`;
  ctx.textBaseline = "top";
  const letterSpacingCapable = ctx as AnyCtx2D & { letterSpacing?: string };
  if ("letterSpacing" in letterSpacingCapable) {
    letterSpacingCapable.letterSpacing = letterSpacing;
  }
}

function drawTextCells(
  ctx: AnyCtx2D,
  text: string,
  x: number,
  y: number,
  charW: number,
  holes?: Set<number>,
  row = 0,
  cols = text.length,
  forceCells = false,
): void {
  if (!forceCells && (!holes || holes.size === 0)) {
    ctx.fillText(text, x, y);
    return;
  }

  for (let col = 0; col < cols; col++) {
    if (holes?.has(row * cols + col)) continue;
    const ch = text[col] || " ";
    if (ch !== " ") ctx.fillText(ch, x + col * charW, y);
  }
}

export interface RenderFrameOptions {
  transparent?: boolean;
}

export function renderFrame(ec: ExportContext, dt: number, time: number, options: RenderFrameOptions = {}): void {
  const { ctx, backdropCanvas, baseLayerCanvas, baseScratchCanvas, width, height, grid, asciiBlendMode, fontSize, fontFamily, letterSpacing, activeEffects, maskGrid, baseText } = ec;
  const { charW, charH, padX, padY } = grid;

  ctx.clearRect(0, 0, width, height);
  if (!options.transparent) {
    ctx.drawImage(backdropCanvas, 0, 0);
  }

  // Composite before drawing base text so applyToAscii cells can punch holes.
  const { glowCells, glowCount } = compositeFrame(activeEffects, dt, time, maskGrid, grid, baseText);
  const holes = collectAsciiOverlayHoles(glowCells, glowCount, grid.cols);

  // 1. ASCII text — pre-rendered layer; erase hole cells on frames that have them.
  // (The bright applyToAscii effect glyph is drawn over each hole, so residual
  // glyph overflow/shadow from the cell-rect erase sits invisibly underneath.)
  ctx.save();
  ctx.globalCompositeOperation = asciiBlendMode as GlobalCompositeOperation;
  if (holes.size === 0) {
    ctx.drawImage(baseLayerCanvas, 0, 0);
  } else {
    const sctx = get2d(baseScratchCanvas);
    sctx.clearRect(0, 0, width, height);
    sctx.drawImage(baseLayerCanvas, 0, 0);
    for (const idx of holes) {
      const row = Math.floor(idx / grid.cols);
      const col = idx % grid.cols;
      sctx.clearRect(padX! + col * charW, padY! + row * charH, charW, charH);
    }
    ctx.drawImage(baseScratchCanvas, 0, 0);
  }
  ctx.restore();

  // 2. Effects
  if (glowCount > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";

    // Glow sprites
    for (let i = 0; i < glowCount; i++) {
      const cell = glowCells[i];
      const rgb = parseColorCached(cell.color);
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
    setCanvasTextStyle(ctx, fontSize, fontFamily, letterSpacing);
    for (let i = 0; i < glowCount; i++) {
      const cell = glowCells[i];
      const rgb = parseColorCached(cell.color);
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
// WebM export via WebCodecs + Mediabunny (explicit frame timestamps)
// ---------------------------------------------------------------------------

export interface StillExportOptions {
  width: number;
  height: number;
  time?: number;
  type?: "image/png" | "image/jpeg" | "image/webp";
  quality?: number;
  transparent?: boolean;
  signal?: AbortSignal;
  onMetrics?: (metrics: ExportMetrics) => void;
  prepareOptions?: PrepareExportOptions;
}

export async function exportStillImage(
  scene: SceneData,
  image: ImageLike,
  mask: Mask | null,
  options: StillExportOptions,
): Promise<Blob> {
  const { width, height, signal } = options;
  throwIfAborted(signal);

  const metrics = createExportMetrics({
    format: options.type === "image/jpeg" ? "jpeg" : "png",
    width,
    height,
    fps: 1,
    duration: 1,
  });
  const ec = await prepareExportContext(scene, image, mask, width, height, options.prepareOptions);
  throwIfAborted(signal);

  renderFrame(ec, 0, options.time ?? 0, { transparent: options.transparent });

  const blob = await canvasToBlob(ec.canvas, options.type ?? "image/png", options.quality);
  throwIfAborted(signal);
  options.onMetrics?.(finishExportMetrics(metrics, { bytes: blob.size }));
  return blob;
}

export interface VideoExportOptions {
  width: number;
  height: number;
  fps?: number;
  videoBitsPerSecond?: number;
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
  onMetrics?: (metrics: ExportMetrics) => void;
  prepareOptions?: PrepareExportOptions;
}

export async function exportWebM(
  scene: SceneData,
  image: ImageLike,
  mask: Mask | null,
  options: VideoExportOptions,
): Promise<{ blob: Blob; ext: string }> {
  const { width, height, onProgress, signal } = options;
  throwIfAborted(signal);
  const ec = await prepareExportContext(scene, image, mask, width, height, options.prepareOptions);
  throwIfAborted(signal);

  const fps = options.fps ?? scene.playback.fps ?? 30;
  const duration = scene.playback.duration || 10;
  const totalFrames = Math.round(duration * fps);
  const frameDuration = 1 / fps;
  const bitrate = options.videoBitsPerSecond ?? 3_000_000;
  const metrics = createExportMetrics({
    format: "webm",
    width,
    height,
    fps,
    duration,
  });

  const {
    BufferTarget,
    CanvasSource,
    getFirstEncodableVideoCodec,
    Mp4OutputFormat,
    Output,
    WebMOutputFormat,
  } = await import("mediabunny");

  let outputFormat = new WebMOutputFormat();
  let codec = await getFirstEncodableVideoCodec(
    ["vp9", "vp8"],
    { width, height, bitrate },
  );

  if (!codec) {
    const mp4Format = new Mp4OutputFormat();
    codec = await getFirstEncodableVideoCodec(
      mp4Format.getSupportedVideoCodecs(),
      { width, height, bitrate },
    );
    if (codec) outputFormat = mp4Format;
  }

  if (!codec) {
    throw new Error("No supported video codec found in this browser");
  }

  const target = new BufferTarget();
  const output = new Output({ format: outputFormat, target });
  const videoSource = new CanvasSource(ec.canvas, { codec, bitrate });
  output.addVideoTrack(videoSource);

  const ext = outputFormat.fileExtension.slice(1);
  const mimeType = outputFormat.mimeType;

  try {
    await output.start();

    for (let f = 0; f < totalFrames; f++) {
      throwIfAborted(signal);
      renderFrame(ec, getFrameDelta(f, fps), getFrameTime(f, fps));
      // Scene timestamps — not wall-clock. MediaRecorder stretches duration when frames render slowly.
      await videoSource.add(getFrameTime(f, fps), frameDuration);
      onProgress?.((f + 1) / totalFrames);
      // Encoder awaits can resolve in pure microtasks; without a periodic
      // macrotask the worker never receives cancel messages.
      if ((f & 7) === 7) await macrotaskYield();
    }

    videoSource.close();
    await output.finalize();
    onProgress?.(1);

    const buffer = target.buffer;
    if (!buffer) throw new Error("Video export produced no data");

    const blob = new Blob([buffer], { type: mimeType });
    const finalMetrics = finishExportMetrics(metrics, { bytes: blob.size });
    options.onMetrics?.({
      ...finalMetrics,
      format: ext === "mp4" ? "mp4" : "webm",
    });
    return { blob, ext };
  } catch (err) {
    try {
      videoSource.close();
    } catch {
      // ignore cleanup errors during abort/failure
    }
    throw err;
  }
}
