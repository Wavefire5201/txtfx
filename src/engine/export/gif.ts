import type { SceneData } from "../scene";
import type { Mask } from "../mask";
import type { ImageLike } from "../canvas-util";
import { prepareExportContext, renderFrame, getFrameDelta, getFrameTime, type PrepareExportOptions } from "./video";
import { macrotaskYield } from "./scheduling";
import { createExportMetrics, finishExportMetrics, type ExportMetrics } from "./diagnostics";
// @ts-expect-error -- gifenc ships CJS/ESM with no bundled types
import { GIFEncoder, quantize, applyPalette, prequantize } from "gifenc";

export type GifPaletteMode = "global" | "local";
export type GifColorFormat = "rgb444" | "rgb565";
type GifPalette = number[][];

export interface GifExportOptions {
  width: number;
  height: number;
  /** GIF frame rate — defaults to 10fps (GIFs should be lightweight) */
  fps?: number;
  /** Max colors per frame — lower = smaller file. Default 64. */
  maxColors?: number;
  /** Optional cap for lightweight preview exports. */
  maxDuration?: number;
  /** Global palette is much faster; local palette is slower but can improve color fidelity. */
  paletteMode?: GifPaletteMode;
  /** rgb444 is faster/lower quality; rgb565 is slower/higher quality. */
  colorFormat?: GifColorFormat;
  /**
   * Pre-rounds channel values to speed up quantization (default true).
   * Disable for maximum fidelity — text antialiasing keeps more levels.
   * Cost is irrelevant now that encoding runs in a worker.
   */
  prequantize?: boolean;
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
  onMetrics?: (metrics: ExportMetrics) => void;
  prepareOptions?: PrepareExportOptions;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw new DOMException("Export cancelled", "AbortError");
}

export function getGifDuration(sceneDuration: number, maxDuration?: number): number {
  const duration = sceneDuration || 10;
  return maxDuration ? Math.min(duration, maxDuration) : duration;
}

export function getGifFrameCount(sceneDuration: number, fps: number, maxDuration?: number): number {
  return Math.max(1, Math.round(getGifDuration(sceneDuration, maxDuration) * fps));
}

/**
 * Local palette mode re-quantizes every frame. Global mode never quantizes
 * inside the encode loop — the palette is built up front from frames sampled
 * across the whole timeline (see buildGlobalGifPalette), so colors that first
 * appear mid-animation (e.g. a firework at t=3s) are represented.
 */
export function shouldQuantizeGifFrame(_frame: number, paletteMode: GifPaletteMode): boolean {
  return paletteMode === "local";
}

/** Evenly spaced sample indices across [0, totalFrames). */
export function pickPaletteSampleFrames(totalFrames: number, sampleCount: number): number[] {
  const count = Math.max(1, Math.min(sampleCount, totalFrames));
  if (count === 1) return [0];
  const picks = new Set<number>();
  for (let i = 0; i < count; i++) {
    picks.add(Math.min(totalFrames - 1, Math.round((i * (totalFrames - 1)) / (count - 1))));
  }
  return [...picks];
}

const PALETTE_PROBE_FPS = 6;
const PALETTE_SAMPLE_FRAMES = 5;

interface GlobalPaletteOptions {
  width: number;
  height: number;
  duration: number;
  maxColors: number;
  colorFormat: GifColorFormat;
  signal?: AbortSignal;
  /** Reports probe progress 0..1 (the encode loop maps it into its own range). */
  onProgress?: (pct: number) => void;
  prepareOptions?: PrepareExportOptions;
}

/**
 * Builds the global palette from frames sampled across the timeline.
 * Uses a fresh ExportContext so the probe simulation does not advance the
 * effect state that the encode pass will start from.
 */
export async function buildGlobalGifPalette(
  scene: SceneData,
  image: ImageLike,
  mask: Mask | null,
  options: GlobalPaletteOptions,
): Promise<GifPalette> {
  const { width, height, duration, maxColors, colorFormat, signal, onProgress } = options;
  const ec = await prepareExportContext(scene, image, mask, width, height, options.prepareOptions);
  const totalProbe = Math.max(1, Math.round(duration * PALETTE_PROBE_FPS));
  const sampleIdx = new Set(pickPaletteSampleFrames(totalProbe, PALETTE_SAMPLE_FRAMES));

  const chunks: Uint8ClampedArray[] = [];
  for (let f = 0; f < totalProbe; f++) {
    throwIfAborted(signal);
    renderFrame(ec, getFrameDelta(f, PALETTE_PROBE_FPS), getFrameTime(f, PALETTE_PROBE_FPS));
    if (sampleIdx.has(f)) {
      chunks.push(ec.ctx.getImageData(0, 0, width, height).data);
    }
    onProgress?.((f + 1) / totalProbe);
    if ((f & 7) === 7) await macrotaskYield();
  }

  let total = 0;
  for (const c of chunks) total += c.length;
  const combined = new Uint8ClampedArray(total);
  let offset = 0;
  for (const c of chunks) {
    combined.set(c, offset);
    offset += c.length;
  }
  prequantize(combined, { roundRGB: colorFormat === "rgb444" ? 8 : 4 });
  return quantize(combined, maxColors, { format: colorFormat, useSqrt: false }) as GifPalette;
}


/**
 * Exports the scene as an animated GIF.
 * Returns a Blob containing the GIF file.
 */
export async function exportGif(
  scene: SceneData,
  image: ImageLike,
  mask: Mask | null,
  options: GifExportOptions,
): Promise<Blob> {
  const { width, height, onProgress, signal } = options;
  throwIfAborted(signal);
  const ec = await prepareExportContext(scene, image, mask, width, height, options.prepareOptions);
  throwIfAborted(signal);

  const gifFps = options.fps ?? 10;
  const maxColors = options.maxColors ?? 64;
  const paletteMode = options.paletteMode ?? "global";
  const colorFormat = options.colorFormat ?? "rgb444";
  const usePrequantize = options.prequantize ?? true;
  const duration = getGifDuration(scene.playback.duration, options.maxDuration);
  const totalFrames = getGifFrameCount(scene.playback.duration, gifFps, options.maxDuration);
  const frameDelay = Math.round(100 / gifFps);
  const metrics = createExportMetrics({
    format: "gif",
    width,
    height,
    fps: gifFps,
    duration,
  });

  const gif = GIFEncoder();
  // Probe pass owns the first slice of the progress bar in global mode.
  const PROBE_SHARE = 0.15;
  const encodeShare = paletteMode === "global" ? 1 - PROBE_SHARE : 1;
  const encodeBase = paletteMode === "global" ? PROBE_SHARE : 0;
  const globalPalette: GifPalette | null = paletteMode === "global"
    ? await buildGlobalGifPalette(scene, image, mask, {
        width, height, duration, maxColors, colorFormat, signal,
        onProgress: (pct) => onProgress?.(pct * PROBE_SHARE),
        prepareOptions: options.prepareOptions,
      })
    : null;

  for (let f = 0; f < totalFrames; f++) {
    throwIfAborted(signal);
    const time = getFrameTime(f, gifFps);
    const dt = getFrameDelta(f, gifFps);

    renderFrame(ec, dt, time);

    // Encode frame
    const imageData = ec.ctx.getImageData(0, 0, width, height);
    if (usePrequantize) {
      prequantize(imageData.data, { roundRGB: colorFormat === "rgb444" ? 8 : 4 });
    }
    const palette: GifPalette | null = shouldQuantizeGifFrame(f, paletteMode)
      ? quantize(imageData.data, maxColors, { format: colorFormat, useSqrt: false }) as GifPalette
      : globalPalette;
    if (!palette) throw new Error("GIF palette was not initialized");
    const index = applyPalette(imageData.data, palette, colorFormat);
    gif.writeFrame(index, width, height, {
      palette: f === 0 || paletteMode === "local" ? palette : undefined,
      delay: frameDelay,
      repeat: scene.playback.loop ? 0 : -1,
    });

    onProgress?.(encodeBase + ((f + 1) / totalFrames) * encodeShare);
    // Let cancel messages / UI work run between expensive frames.
    await macrotaskYield();
  }

  gif.finish();
  onProgress?.(1);

  const buffer = gif.bytesView();
  const blob = new Blob([buffer], { type: "image/gif" });
  options.onMetrics?.(finishExportMetrics(metrics, { bytes: blob.size }));
  return blob;
}
