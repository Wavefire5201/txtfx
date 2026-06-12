import { describe, it, expect, afterEach } from "vitest";
import {
  exportGifAuto,
  exportStillAuto,
  exportWebMAuto,
  _resetExportWorkerForTests,
  _getLastExportPath,
} from "./client";
import { exportStillImage } from "./video";
import { Mask } from "../mask";
import { fixtureScenes, loadTestImage } from "@/test/fixtures";
import { diffImageData } from "@/test/pixel";

// ---------------------------------------------------------------------------
// Worker export round-trip, cancellation, transfer-safety, and parity tests.
// NOTE: the worker has its own Math.random (seedMathRandom can't reach it),
// so cross-thread comparisons use the deterministic baseOnly fixture.
// ---------------------------------------------------------------------------

const W = 160;
const H = 100;

afterEach(() => {
  _resetExportWorkerForTests();
});

async function blobToImageData(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

describe("worker export", () => {
  it("round-trips a GIF job through the worker with monotonic progress", async () => {
    const img = await loadTestImage(W, H);
    const progress: number[] = [];
    const blob = await exportGifAuto(fixtureScenes.effects(), img, null, {
      width: W,
      height: H,
      fps: 5,
      maxColors: 32,
      maxDuration: 2,
      onProgress: (p) => progress.push(p),
    });
    expect(_getLastExportPath()).toBe("worker");
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe("image/gif");
    expect(progress.length).toBeGreaterThan(1);
    expect(progress.at(-1)).toBe(1);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
    }
  });

  it("cancel aborts a worker job quickly", async () => {
    const img = await loadTestImage(640, 400);
    const controller = new AbortController();
    const scene = fixtureScenes.effects();
    scene.playback.duration = 30;
    const promise = exportGifAuto(scene, img, null, {
      width: 640,
      height: 400,
      fps: 15,
      maxColors: 256,
      paletteMode: "local",
      colorFormat: "rgb565",
      signal: controller.signal,
      // Abort as soon as the first progress message proves the job is running
      onProgress: () => {
        if (!controller.signal.aborted) controller.abort();
      },
    });
    const started = performance.now();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    // Must be a soft cancel (worker yields macrotasks), well under the
    // 1.5s terminate backstop + full export time.
    expect(performance.now() - started).toBeLessThan(5000);
  });

  it("does not detach or mutate the editor's mask", async () => {
    const img = await loadTestImage(W, H);
    const mask = new Mask(W, H);
    mask.paintBrush(50, 50, 20, 0);
    const before = mask.data.slice();

    await exportStillAuto(fixtureScenes.baseOnly(), img, mask, { width: W, height: H });

    expect(_getLastExportPath()).toBe("worker");
    expect(mask.data.byteLength).toBe(W * H); // a transferred buffer would be detached (byteLength 0)
    expect(mask.data).toEqual(before);
  });

  it("runs two jobs back-to-back on the same worker (ImageBitmap recreated per job)", async () => {
    const img = await loadTestImage(W, H);
    const a = await exportStillAuto(fixtureScenes.baseOnly(), img, null, { width: W, height: H });
    const b = await exportStillAuto(fixtureScenes.baseOnly(), img, null, { width: W, height: H });
    expect(a.size).toBeGreaterThan(0);
    expect(b.size).toBeGreaterThan(0);
    expect(_getLastExportPath()).toBe("worker");
  });

  it("worker output is pixel-equivalent to main-thread output (deterministic scene)", async () => {
    const img = await loadTestImage(W, H);
    const workerBlob = await exportStillAuto(fixtureScenes.baseOnly(), img, null, { width: W, height: H });
    expect(_getLastExportPath()).toBe("worker");
    const mainBlob = await exportStillImage(fixtureScenes.baseOnly(), img, null, { width: W, height: H });

    // Byte-parity by design: raw-pixel image marshalling + canvas-source
    // sampling normalization make the two paths produce identical frames.
    const stats = diffImageData(await blobToImageData(workerBlob), await blobToImageData(mainBlob));
    expect(stats.mse).toBeLessThan(0.5);
    expect(stats.maxChannelDiff).toBeLessThanOrEqual(1);
  });

  it.skipIf(typeof VideoEncoder === "undefined")("round-trips a WebM job through the worker", async () => {
    const img = await loadTestImage(W, H);
    const scene = fixtureScenes.effects();
    scene.playback.duration = 1;
    const progress: number[] = [];
    const { blob, ext } = await exportWebMAuto(scene, img, null, {
      width: W,
      height: H,
      fps: 10,
      videoBitsPerSecond: 500_000,
      onProgress: (p) => progress.push(p),
    });
    expect(_getLastExportPath()).toBe("worker");
    expect(blob.size).toBeGreaterThan(0);
    expect(["webm", "mp4"]).toContain(ext);
    expect(progress.at(-1)).toBe(1);
  });
});
