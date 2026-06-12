/**
 * Message protocol between the export client (main thread) and export.worker.
 * Keep this module dependency-light: it is imported by both sides.
 */
import type { SceneData } from "../scene";
import type { ExportMetrics } from "./diagnostics";
import type { GifColorFormat, GifPaletteMode } from "./gif";

export interface WorkerFontPayload {
  family: string;
  weight: string;
  /** woff2 bytes — structured-cloned (small), NOT transferred, so the client cache stays valid. */
  data: ArrayBuffer;
}

export interface WorkerMaskPayload {
  width: number;
  height: number;
  /** Copy of the editor mask's data — the underlying buffer IS transferred. */
  data: Uint8Array;
}

/**
 * Source image as raw pixels, rasterized on the MAIN thread.
 * createImageBitmap decodes slightly differently than drawing an
 * HTMLImageElement (Chromium), which shifted ASCII ramp indices at luminance
 * boundaries — raw pixels make worker output byte-identical to main-thread
 * output. The buffer is transferred (zero-copy).
 */
export interface WorkerImagePayload {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface WorkerCharMetrics {
  charW: number;
  charH: number;
}

interface BaseJob {
  id: number;
  scene: SceneData;
  image: WorkerImagePayload;
  mask: WorkerMaskPayload | null;
  fonts: WorkerFontPayload[];
  /** Main-thread measurement so worker grid layout matches even under font fallback. */
  charMetrics: WorkerCharMetrics;
  width: number;
  height: number;
}

export interface WebmJob extends BaseJob {
  kind: "webm";
  fps: number;
  videoBitsPerSecond: number;
}

export interface GifJob extends BaseJob {
  kind: "gif";
  fps: number;
  maxColors: number;
  maxDuration?: number;
  paletteMode: GifPaletteMode;
  colorFormat: GifColorFormat;
  prequantize?: boolean;
}

export interface StillJob extends BaseJob {
  kind: "still";
  time?: number;
  type?: "image/png" | "image/jpeg" | "image/webp";
  quality?: number;
  transparent?: boolean;
}

export type ExportJob = WebmJob | GifJob | StillJob;

export type ToWorker =
  | { type: "job"; job: ExportJob }
  | { type: "cancel"; id: number };

export interface WorkerCaps {
  offscreen2d: boolean;
  fonts: boolean;
  videoEncoder: boolean;
}

export type FromWorker =
  | { type: "ready"; caps: WorkerCaps }
  | { type: "progress"; id: number; pct: number }
  | { type: "done"; id: number; blob: Blob; ext: string; metrics?: ExportMetrics }
  | { type: "error"; id: number; name: string; message: string };
