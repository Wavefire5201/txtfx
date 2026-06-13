/**
 * Animated PNG (APNG) export — the modern GIF replacement: full 24-bit color
 * plus real 8-bit alpha (no 256-color quantization, no 1-bit transparency).
 *
 * Dependency-free: frames are filtered (PNG filter type 0) and zlib-compressed
 * with the platform `CompressionStream("deflate")` (RFC 1950 — exactly what PNG
 * IDAT/fdAT chunks expect). Runs identically on the main thread and in the
 * export worker.
 *
 * Each frame is written full-size with blend_op SOURCE (overwrite, alpha
 * included), so transparent and opaque animations are both correct without
 * region/dispose optimization.
 */
import type { SceneData } from "../scene";
import type { Mask } from "../mask";
import type { ImageLike } from "../canvas-util";
import {
  prepareExportContext,
  renderFrame,
  getFrameDelta,
  getFrameTime,
  type PrepareExportOptions,
} from "./video";
import { macrotaskYield } from "./scheduling";
import { createExportMetrics, finishExportMetrics, type ExportMetrics } from "./diagnostics";

export interface ApngExportOptions {
  width: number;
  height: number;
  /** Frame rate — defaults to 12fps. */
  fps?: number;
  /** Optional cap on encoded duration (seconds). */
  maxDuration?: number;
  /** Render over a transparent backdrop instead of the scene image. Default true. */
  transparent?: boolean;
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
  onMetrics?: (metrics: ExportMetrics) => void;
  prepareOptions?: PrepareExportOptions;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Builds a PNG chunk: length, type, data, CRC(type+data). */
function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) body[i] = type.charCodeAt(i);
  body.set(data, 4);
  const out = new Uint8Array(8 + data.length + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(body, 4);
  dv.setUint32(8 + data.length, crc32(body));
  return out;
}

function ihdr(width: number, height: number): Uint8Array {
  const d = new Uint8Array(13);
  const dv = new DataView(d.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  d[8] = 8; // bit depth
  d[9] = 6; // color type: RGBA
  d[10] = 0; // compression
  d[11] = 0; // filter
  d[12] = 0; // interlace
  return d;
}

function actl(numFrames: number, numPlays: number): Uint8Array {
  const d = new Uint8Array(8);
  const dv = new DataView(d.buffer);
  dv.setUint32(0, numFrames);
  dv.setUint32(4, numPlays);
  return d;
}

function fctl(seq: number, width: number, height: number, delayNum: number, delayDen: number): Uint8Array {
  const d = new Uint8Array(26);
  const dv = new DataView(d.buffer);
  dv.setUint32(0, seq);
  dv.setUint32(4, width);
  dv.setUint32(8, height);
  dv.setUint32(12, 0); // x_offset
  dv.setUint32(16, 0); // y_offset
  dv.setUint16(20, delayNum);
  dv.setUint16(22, delayDen);
  d[24] = 0; // dispose_op = NONE
  d[25] = 0; // blend_op = SOURCE (overwrite, alpha included)
  return d;
}

/** Prepends a filter-type byte (0 = None) to each scanline. */
function addFilterBytes(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const stride = width * 4;
  const out = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const src = y * stride;
    const dst = y * (stride + 1);
    out[dst] = 0;
    out.set(rgba.subarray(src, src + stride), dst + 1);
  }
  return out;
}

/** zlib-compresses bytes via CompressionStream (RFC 1950 — PNG-compatible). */
async function zlibDeflate(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  // Cast: a fresh Uint8Array is ArrayBuffer-backed, but TS widens to
  // ArrayBufferLike (could be SharedArrayBuffer) and rejects it as BufferSource.
  void writer.write(bytes as BufferSource);
  void writer.close();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/**
 * Exports the scene as an animated PNG (APNG). Returns an `image/png` Blob.
 */
export async function exportApng(
  scene: SceneData,
  image: ImageLike,
  mask: Mask | null,
  options: ApngExportOptions,
): Promise<Blob> {
  const { width, height, signal } = options;
  throwIfAborted(signal);

  const fps = options.fps ?? 12;
  const baseDuration = scene.playback.duration || 10;
  const duration = options.maxDuration ? Math.min(baseDuration, options.maxDuration) : baseDuration;
  const totalFrames = Math.max(1, Math.round(duration * fps));
  const delayNum = Math.max(1, Math.round(1000 / fps));
  const transparent = options.transparent ?? true;
  const numPlays = scene.playback.loop ? 0 : 1;

  const metrics = createExportMetrics({ format: "apng", width, height, fps, duration });

  const ec = await prepareExportContext(scene, image, mask, width, height, options.prepareOptions);
  throwIfAborted(signal);

  const parts: Uint8Array[] = [
    PNG_SIGNATURE,
    makeChunk("IHDR", ihdr(width, height)),
    makeChunk("acTL", actl(totalFrames, numPlays)),
  ];

  // fcTL and fdAT share one increasing sequence counter; a frame's fcTL must be
  // exactly one less than its fdAT. Frame 0 is also the PNG default image (IDAT).
  let seq = 0;
  for (let f = 0; f < totalFrames; f++) {
    throwIfAborted(signal);
    renderFrame(ec, getFrameDelta(f, fps), getFrameTime(f, fps), { transparent });
    const imageData = ec.ctx.getImageData(0, 0, width, height);
    const compressed = await zlibDeflate(addFilterBytes(imageData.data, width, height));

    parts.push(makeChunk("fcTL", fctl(seq++, width, height, delayNum, 1000)));
    if (f === 0) {
      parts.push(makeChunk("IDAT", compressed));
    } else {
      const fdat = new Uint8Array(4 + compressed.length);
      new DataView(fdat.buffer).setUint32(0, seq++);
      fdat.set(compressed, 4);
      parts.push(makeChunk("fdAT", fdat));
    }

    options.onProgress?.((f + 1) / totalFrames);
    // Let cancel messages / UI work run between expensive frames.
    await macrotaskYield();
  }

  parts.push(makeChunk("IEND", new Uint8Array(0)));
  options.onProgress?.(1);

  const blob = new Blob([concat(parts) as BlobPart], { type: "image/png" });
  options.onMetrics?.(finishExportMetrics(metrics, { bytes: blob.size }));
  return blob;
}
