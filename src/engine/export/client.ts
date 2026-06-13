/**
 * Main-thread client for the export worker.
 *
 * Exports run in a Worker so the editor UI never freezes (and GIF encoding
 * no longer pays a setTimeout-clamp yield per frame). When the worker is
 * unavailable or lacks capabilities (no module workers, no OffscreenCanvas 2D,
 * no VideoEncoder — e.g. older Safari), the SAME pipeline runs on the main
 * thread via the functions in gif.ts / video.ts; output is identical either way.
 */
import { Mask } from "../mask";
import type { SceneData } from "../scene";
import { exportGif, type GifExportOptions } from "./gif";
import { exportApng, type ApngExportOptions } from "./apng";
import {
  exportWebM,
  exportStillImage,
  measureCharDimensions,
  parseFontSize,
  type VideoExportOptions,
  type StillExportOptions,
} from "./video";
import type {
  ExportJob,
  FromWorker,
  ToWorker,
  WorkerCaps,
  WorkerCharMetrics,
  WorkerFontPayload,
  WorkerImagePayload,
  WorkerMaskPayload,
} from "./worker-protocol";

/** Internal sentinel: the worker path can't run this job — use the main thread. */
class WorkerUnavailableError extends Error {}

interface PendingJob {
  resolve: (result: { blob: Blob; ext: string }) => void;
  reject: (err: Error) => void;
  onProgress?: (pct: number) => void;
  onMetrics?: (metrics: import("./diagnostics").ExportMetrics) => void;
}

let worker: Worker | null = null;
let readyPromise: Promise<WorkerCaps> | null = null;
let nextJobId = 1;
const pending = new Map<number, PendingJob>();

function teardownWorker(reason: Error): void {
  for (const job of pending.values()) job.reject(reason);
  pending.clear();
  worker?.terminate();
  worker = null;
  readyPromise = null;
}

function handleMessage(e: MessageEvent<FromWorker>): void {
  const msg = e.data;
  if (msg.type === "progress") {
    pending.get(msg.id)?.onProgress?.(msg.pct);
  } else if (msg.type === "done") {
    const job = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.metrics) job?.onMetrics?.(msg.metrics);
    job?.resolve({ blob: msg.blob, ext: msg.ext });
  } else if (msg.type === "error") {
    const job = pending.get(msg.id);
    pending.delete(msg.id);
    job?.reject(
      msg.name === "AbortError"
        ? new DOMException(msg.message, "AbortError")
        : Object.assign(new Error(msg.message), { name: msg.name }),
    );
  }
}

function getWorkerReady(): Promise<WorkerCaps> {
  if (typeof Worker === "undefined") {
    return Promise.reject(new WorkerUnavailableError("Worker API unavailable"));
  }
  if (!readyPromise) {
    readyPromise = new Promise<WorkerCaps>((resolve, reject) => {
      let w: Worker;
      try {
        w = new Worker(new URL("./export.worker.ts", import.meta.url), { type: "module" });
      } catch (err) {
        reject(new WorkerUnavailableError(`Worker construction failed: ${err}`));
        return;
      }
      const timeout = setTimeout(() => {
        reject(new WorkerUnavailableError("export worker handshake timeout"));
        w.terminate();
        worker = null;
        readyPromise = null;
      }, 3000);
      w.addEventListener("message", (e: MessageEvent<FromWorker>) => {
        if (e.data?.type === "ready") {
          clearTimeout(timeout);
          resolve(e.data.caps);
        } else {
          handleMessage(e);
        }
      });
      w.addEventListener("error", (e) => {
        clearTimeout(timeout);
        const err = new Error(`export worker error: ${e.message || "unknown"}`);
        reject(new WorkerUnavailableError(err.message));
        teardownWorker(err);
      });
      worker = w;
    });
  }
  return readyPromise;
}

// --- Job input marshalling -------------------------------------------------

const fontCache = new Map<string, Promise<WorkerFontPayload[]>>();

/**
 * Extracts the scene's primary font's @font-face sources from same-origin
 * stylesheets and fetches the bytes so the worker can register them.
 * Best-effort: an empty result means the worker uses the same system
 * fallback the main thread would.
 */
function collectFonts(fontFamily: string): Promise<WorkerFontPayload[]> {
  const primary = fontFamily.split(",")[0].trim().replace(/['"]/g, "");
  let cached = fontCache.get(primary);
  if (!cached) {
    cached = (async () => {
      if (typeof document === "undefined" || !primary) return [];
      try {
        await document.fonts.ready;
      } catch {
        return [];
      }
      const sources = new Map<string, string>(); // url -> weight
      const keyword = primary.split(/\s+/)[0].toLowerCase();
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules; // cross-origin sheets throw
        } catch {
          continue;
        }
        for (const rule of Array.from(rules)) {
          if (!(rule instanceof CSSFontFaceRule)) continue;
          const family = rule.style.getPropertyValue("font-family").replace(/['"]/g, "").trim();
          // next/font mangles names (e.g. "__JetBrains_Mono_abc123") — match loosely.
          if (!family.toLowerCase().includes(keyword)) continue;
          const src = rule.style.getPropertyValue("src");
          const url = src.match(/url\(\s*([^)\s]+?)\s*\)/)?.[1]?.replace(/['"]/g, "");
          if (url) sources.set(url, rule.style.getPropertyValue("font-weight") || "400");
        }
      }
      const fonts: WorkerFontPayload[] = [];
      for (const [url, weight] of sources) {
        try {
          const res = await fetch(url);
          if (res.ok) fonts.push({ family: primary, weight, data: await res.arrayBuffer() });
        } catch {
          // unreachable font file — skip
        }
      }
      return fonts;
    })();
    fontCache.set(primary, cached);
  }
  return cached;
}

/**
 * Decode the image via a main-thread canvas draw — the SAME decode the
 * main-thread pipeline uses. (createImageBitmap decodes slightly differently
 * in Chromium, which shifted ASCII ramp chars at luminance boundaries.)
 */
function rasterizeImage(img: HTMLImageElement): WorkerImagePayload {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

function measureCharMetrics(scene: SceneData, width: number): WorkerCharMetrics {
  const fontSize = parseFontSize(scene.ascii.fontSize, width);
  return measureCharDimensions(
    fontSize,
    scene.ascii.fontFamily,
    scene.ascii.lineHeight,
    scene.ascii.letterSpacing || "0px",
  );
}

async function resolveMaskPayload(
  scene: SceneData,
  mask: Mask | null,
  image: HTMLImageElement,
): Promise<WorkerMaskPayload | null> {
  if (mask) {
    // Slice: transferring the live editor mask buffer would detach it.
    return { width: mask.width, height: mask.height, data: mask.data.slice() };
  }
  if (scene.mask?.data) {
    try {
      const decoded = await Mask.fromBase64(scene.mask.data, image.naturalWidth, image.naturalHeight);
      return { width: decoded.width, height: decoded.height, data: decoded.data };
    } catch {
      return null;
    }
  }
  return null;
}

interface CommonJobInput {
  scene: SceneData;
  image: HTMLImageElement;
  mask: Mask | null;
  width: number;
  height: number;
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
  onMetrics?: (metrics: import("./diagnostics").ExportMetrics) => void;
}

/** Fields shared by every job kind (ExportJob is a discriminated union). */
interface JobBase {
  id: number;
  scene: SceneData;
  image: WorkerImagePayload;
  mask: WorkerMaskPayload | null;
  fonts: WorkerFontPayload[];
  charMetrics: WorkerCharMetrics;
  width: number;
  height: number;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
}

const CANCEL_KILL_BACKSTOP_MS = 1500;

async function runWorkerJob(
  input: CommonJobInput,
  buildJob: (base: JobBase) => ExportJob,
): Promise<{ blob: Blob; ext: string }> {
  const caps = await getWorkerReady();
  if (!caps.offscreen2d) throw new WorkerUnavailableError("no OffscreenCanvas 2d in worker");

  throwIfAborted(input.signal);
  const id = nextJobId++;
  const [fonts, maskPayload] = await Promise.all([
    collectFonts(input.scene.ascii.fontFamily),
    resolveMaskPayload(input.scene, input.mask, input.image),
  ]);
  const image = rasterizeImage(input.image);
  throwIfAborted(input.signal);

  const job = buildJob({
    id,
    scene: input.scene,
    image,
    mask: maskPayload,
    fonts,
    charMetrics: measureCharMetrics(input.scene, input.width),
    width: input.width,
    height: input.height,
  });

  let backstop: ReturnType<typeof setTimeout> | undefined;
  const onAbort = () => {
    worker?.postMessage({ type: "cancel", id } satisfies ToWorker);
    // If the worker doesn't acknowledge (stuck in a non-yielding loop), kill it.
    backstop = setTimeout(() => {
      teardownWorker(new DOMException("Export cancelled", "AbortError"));
    }, CANCEL_KILL_BACKSTOP_MS);
  };

  const promise = new Promise<{ blob: Blob; ext: string }>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress: input.onProgress, onMetrics: input.onMetrics });
  });
  input.signal?.addEventListener("abort", onAbort, { once: true });

  const transfers: Transferable[] = [image.data.buffer as ArrayBuffer];
  if (maskPayload) transfers.push(maskPayload.data.buffer as ArrayBuffer);
  worker!.postMessage({ type: "job", job } satisfies ToWorker, transfers);

  try {
    return await promise;
  } finally {
    input.signal?.removeEventListener("abort", onAbort);
    if (backstop !== undefined) clearTimeout(backstop);
    pending.delete(id);
  }
}

// --- Public API (Toolbar entry points) --------------------------------------

type GifAutoOptions = Omit<GifExportOptions, "prepareOptions"> & { onMetrics?: GifExportOptions["onMetrics"] };

export async function exportGifAuto(
  scene: SceneData,
  image: HTMLImageElement,
  mask: Mask | null,
  options: GifAutoOptions,
): Promise<Blob> {
  try {
    const { blob } = await runWorkerJob(
      { scene, image, mask, ...pickCommon(options) },
      (base) => ({
        ...base,
        kind: "gif",
        fps: options.fps ?? 10,
        maxColors: options.maxColors ?? 64,
        maxDuration: options.maxDuration,
        paletteMode: options.paletteMode ?? "global",
        colorFormat: options.colorFormat ?? "rgb444",
        prequantize: options.prequantize,
      }),
    );
    _setLastExportPath("worker");
    return blob;
  } catch (err) {
    if (!(err instanceof WorkerUnavailableError)) throw err;
    console.warn("[txtfx export] worker unavailable, exporting on main thread:", err.message);
    _setLastExportPath("main");
    return exportGif(scene, image, mask, options);
  }
}

export async function exportWebMAuto(
  scene: SceneData,
  image: HTMLImageElement,
  mask: Mask | null,
  options: Omit<VideoExportOptions, "prepareOptions">,
): Promise<{ blob: Blob; ext: string }> {
  try {
    const caps = await getWorkerReady();
    if (!caps.videoEncoder) throw new WorkerUnavailableError("no VideoEncoder in worker");
    const result = await runWorkerJob(
      { scene, image, mask, ...pickCommon(options) },
      (base) => ({
        ...base,
        kind: "webm",
        fps: options.fps ?? 30,
        videoBitsPerSecond: options.videoBitsPerSecond ?? 3_000_000,
        transparent: options.transparent,
      }),
    );
    _setLastExportPath("worker");
    return result;
  } catch (err) {
    if (!(err instanceof WorkerUnavailableError)) throw err;
    console.warn("[txtfx export] worker unavailable, exporting on main thread:", err.message);
    _setLastExportPath("main");
    return exportWebM(scene, image, mask, options);
  }
}

export async function exportApngAuto(
  scene: SceneData,
  image: HTMLImageElement,
  mask: Mask | null,
  options: Omit<ApngExportOptions, "prepareOptions">,
): Promise<Blob> {
  try {
    const { blob } = await runWorkerJob(
      { scene, image, mask, ...pickCommon(options) },
      (base) => ({
        ...base,
        kind: "apng",
        fps: options.fps ?? 12,
        maxDuration: options.maxDuration,
        transparent: options.transparent,
      }),
    );
    _setLastExportPath("worker");
    return blob;
  } catch (err) {
    if (!(err instanceof WorkerUnavailableError)) throw err;
    console.warn("[txtfx export] worker unavailable, exporting on main thread:", err.message);
    _setLastExportPath("main");
    return exportApng(scene, image, mask, options);
  }
}

export async function exportStillAuto(
  scene: SceneData,
  image: HTMLImageElement,
  mask: Mask | null,
  options: Omit<StillExportOptions, "prepareOptions">,
): Promise<Blob> {
  try {
    const { blob } = await runWorkerJob(
      { scene, image, mask, ...pickCommon(options) },
      (base) => ({
        ...base,
        kind: "still",
        time: options.time,
        type: options.type,
        quality: options.quality,
        transparent: options.transparent,
      }),
    );
    _setLastExportPath("worker");
    return blob;
  } catch (err) {
    if (!(err instanceof WorkerUnavailableError)) throw err;
    console.warn("[txtfx export] worker unavailable, exporting on main thread:", err.message);
    _setLastExportPath("main");
    return exportStillImage(scene, image, mask, options);
  }
}

function pickCommon(options: {
  width: number;
  height: number;
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
  onMetrics?: (metrics: import("./diagnostics").ExportMetrics) => void;
}) {
  return {
    width: options.width,
    height: options.height,
    signal: options.signal,
    onProgress: options.onProgress,
    onMetrics: options.onMetrics,
  };
}

/** Test hook: force the next export onto a fresh worker (or simulate absence). */
export function _resetExportWorkerForTests(): void {
  teardownWorker(new Error("test reset"));
}

let _lastExportPath: "worker" | "main" | null = null;
/** Test/diagnostic hook: which path the most recent export took. */
export function _getLastExportPath(): "worker" | "main" | null {
  return _lastExportPath;
}
export function _setLastExportPath(path: "worker" | "main"): void {
  _lastExportPath = path;
}
