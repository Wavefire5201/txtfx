/**
 * Export worker — runs the full render+encode pipeline off the main thread.
 * The pipeline modules (video.ts / gif.ts) are environment-agnostic; this
 * file only handles messaging, fonts, and cancellation.
 */
import { Mask } from "../mask";
import { exportGif } from "./gif";
import { exportWebM, exportStillImage } from "./video";
import type { ExportMetrics } from "./diagnostics";
import type { ToWorker, FromWorker, ExportJob, WorkerFontPayload, WorkerCaps } from "./worker-protocol";

const scope = self as unknown as {
  postMessage(msg: FromWorker): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  fonts?: FontFaceSet;
};

function post(msg: FromWorker): void {
  scope.postMessage(msg);
}

function detectCaps(): WorkerCaps {
  let offscreen2d = false;
  try {
    offscreen2d = new OffscreenCanvas(1, 1).getContext("2d") !== null;
  } catch {
    offscreen2d = false;
  }
  return {
    offscreen2d,
    fonts: typeof FontFace !== "undefined" && !!scope.fonts,
    videoEncoder: typeof VideoEncoder !== "undefined",
  };
}

const controllers = new Map<number, AbortController>();
const loadedFonts = new Set<string>();

async function loadFonts(fonts: WorkerFontPayload[]): Promise<void> {
  if (!scope.fonts || typeof FontFace === "undefined") return;
  for (const f of fonts) {
    const key = `${f.family}|${f.weight}`;
    if (loadedFonts.has(key)) continue;
    try {
      const face = new FontFace(f.family, f.data, { weight: f.weight });
      await face.load();
      scope.fonts.add(face);
      loadedFonts.add(key);
    } catch {
      // Glyphs fall back to a system font; charMetrics keeps the layout identical.
    }
  }
}

/** Throttled progress relay — never floods the main thread, always delivers 1. */
function makeProgressRelay(id: number): (pct: number) => void {
  let lastPost = 0;
  return (pct: number) => {
    const now = Date.now();
    if (pct >= 1 || now - lastPost > 33) {
      lastPost = now;
      post({ type: "progress", id, pct });
    }
  };
}

/** Rebuild the source image from raw pixels onto a canvas (a valid drawImage source). */
function imageFromPayload(payload: { width: number; height: number; data: Uint8ClampedArray }): OffscreenCanvas {
  const canvas = new OffscreenCanvas(payload.width, payload.height);
  const ctx = canvas.getContext("2d")!;
  // Cast: the transferred buffer is a plain ArrayBuffer at runtime; TS's
  // Uint8ClampedArray<ArrayBufferLike> default doesn't satisfy ImageDataArray.
  const pixels = payload.data as Uint8ClampedArray<ArrayBuffer>;
  ctx.putImageData(new ImageData(pixels, payload.width, payload.height), 0, 0);
  return canvas;
}

async function runJob(job: ExportJob): Promise<void> {
  const controller = new AbortController();
  controllers.set(job.id, controller);
  const onProgress = makeProgressRelay(job.id);
  let metrics: ExportMetrics | undefined;
  const onMetrics = (m: ExportMetrics) => { metrics = m; };

  try {
    await loadFonts(job.fonts);
    const image = imageFromPayload(job.image);
    const mask = job.mask ? new Mask(job.mask.width, job.mask.height, job.mask.data) : null;
    const common = {
      signal: controller.signal,
      onProgress,
      onMetrics,
      prepareOptions: { charMetrics: job.charMetrics },
    };

    let blob: Blob;
    let ext: string;
    if (job.kind === "gif") {
      blob = await exportGif(job.scene, image, mask, {
        width: job.width,
        height: job.height,
        fps: job.fps,
        maxColors: job.maxColors,
        maxDuration: job.maxDuration,
        paletteMode: job.paletteMode,
        colorFormat: job.colorFormat,
        prequantize: job.prequantize,
        ...common,
      });
      ext = "gif";
    } else if (job.kind === "webm") {
      const result = await exportWebM(job.scene, image, mask, {
        width: job.width,
        height: job.height,
        fps: job.fps,
        videoBitsPerSecond: job.videoBitsPerSecond,
        ...common,
      });
      blob = result.blob;
      ext = result.ext;
    } else {
      blob = await exportStillImage(job.scene, image, mask, {
        width: job.width,
        height: job.height,
        time: job.time,
        type: job.type,
        quality: job.quality,
        transparent: job.transparent,
        ...common,
      });
      ext = job.type === "image/jpeg" ? "jpg" : job.type === "image/webp" ? "webp" : "png";
    }
    post({ type: "done", id: job.id, blob, ext, metrics });
  } catch (err) {
    const e = err as Error;
    post({ type: "error", id: job.id, name: e?.name ?? "Error", message: e?.message ?? String(err) });
  } finally {
    controllers.delete(job.id);
  }
}

scope.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === "job") {
    void runJob(msg.job);
  } else if (msg.type === "cancel") {
    controllers.get(msg.id)?.abort();
  }
};

post({ type: "ready", caps: detectCaps() });
