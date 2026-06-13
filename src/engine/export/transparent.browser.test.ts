import { describe, it, expect } from "vitest";
import { exportApng } from "./apng";
import { exportWebM } from "./video";
import { fixtureScenes, loadTestImage } from "@/test/fixtures";

const W = 120;
const H = 80;

/** Parses PNG/APNG chunks (type + data), skipping the 8-byte signature. */
function readChunks(buf: Uint8Array): { type: string; data: Uint8Array }[] {
  const chunks: { type: string; data: Uint8Array }[] = [];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
    chunks.push({ type, data: buf.subarray(off + 8, off + 8 + len) });
    off += 12 + len; // length(4) + type(4) + data + crc(4)
    if (type === "IEND") break;
  }
  return chunks;
}

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

/** Decodes a PNG/APNG blob's first frame and returns its pixels. */
async function decodeFirstFrame(blob: Blob): Promise<ImageData> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode failed"));
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

describe("APNG export", () => {
  it("produces a valid APNG with the expected animation chunks", async () => {
    const img = await loadTestImage(W, H);
    const scene = fixtureScenes.effects();
    scene.playback.duration = 1;
    const progress: number[] = [];
    const blob = await exportApng(scene, img, null, {
      width: W,
      height: H,
      fps: 8,
      maxDuration: 1,
      transparent: false,
      onProgress: (p) => progress.push(p),
    });

    expect(blob.type).toBe("image/png");
    const buf = new Uint8Array(await blob.arrayBuffer());
    expect([...buf.slice(0, 8)]).toEqual(PNG_SIG);

    const chunks = readChunks(buf);
    const types = chunks.map((c) => c.type);
    expect(types[0]).toBe("IHDR");
    expect(types).toContain("acTL");
    expect(types).toContain("IDAT");
    expect(types.at(-1)).toBe("IEND");

    // acTL num_frames must equal the encoded frame count (8fps × 1s = 8).
    const actl = chunks.find((c) => c.type === "acTL")!;
    const numFrames = new DataView(actl.data.buffer, actl.data.byteOffset).getUint32(0);
    expect(numFrames).toBe(8);

    // One fcTL per frame; frames after the first carry fdAT (not IDAT).
    expect(types.filter((t) => t === "fcTL").length).toBe(8);
    expect(types.filter((t) => t === "fdAT").length).toBe(7);

    expect(progress.at(-1)).toBe(1);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
    }
  });

  it("is byte-reproducible for the same seeded scene", async () => {
    const img = await loadTestImage(W, H);
    const scene = fixtureScenes.effects();
    scene.playback.duration = 1;
    const opts = { width: W, height: H, fps: 8, maxDuration: 1 } as const;
    const a = new Uint8Array(await (await exportApng(scene, img, null, opts)).arrayBuffer());
    const b = new Uint8Array(await (await exportApng(scene, img, null, opts)).arrayBuffer());
    expect(a).toEqual(b);
  });

  it("transparent mode carries real alpha; opaque mode does not", async () => {
    const img = await loadTestImage(W, H);
    const scene = fixtureScenes.baseOnly();
    scene.playback.duration = 1;

    const transparent = await exportApng(scene, img, null, {
      width: W, height: H, fps: 4, maxDuration: 1, transparent: true,
    });
    const opaque = await exportApng(scene, img, null, {
      width: W, height: H, fps: 4, maxDuration: 1, transparent: false,
    });

    const tData = (await decodeFirstFrame(transparent)).data;
    const oData = (await decodeFirstFrame(opaque)).data;

    let transparentPixels = 0;
    let opaqueMinAlpha = 255;
    for (let i = 3; i < tData.length; i += 4) if (tData[i] < 10) transparentPixels++;
    for (let i = 3; i < oData.length; i += 4) opaqueMinAlpha = Math.min(opaqueMinAlpha, oData[i]);

    // Transparent backdrop leaves fully-clear gaps where there is no glyph.
    expect(transparentPixels).toBeGreaterThan(0);
    // The opaque backdrop fills every pixel.
    expect(opaqueMinAlpha).toBe(255);
  });
});

describe("Transparent WebM export", () => {
  it("encodes an alpha WebM on a VP8/VP9 container", async () => {
    const img = await loadTestImage(W, H);
    const scene = fixtureScenes.effects();
    scene.playback.duration = 1;
    const { blob, ext } = await exportWebM(scene, img, null, {
      width: W,
      height: H,
      fps: 8,
      videoBitsPerSecond: 1_000_000,
      transparent: true,
    });
    // Alpha side data only lives in WebM/Matroska — never the MP4 fallback.
    expect(ext).toBe("webm");
    expect(blob.size).toBeGreaterThan(0);
  });
});
