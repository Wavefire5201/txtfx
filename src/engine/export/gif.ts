import type { SceneData } from "../scene";
import type { Mask } from "../mask";
import { prepareExportContext, renderFrame } from "./video";
// @ts-expect-error -- gifenc ships CJS/ESM with no bundled types
import { GIFEncoder, quantize, applyPalette } from "gifenc";

export interface GifExportOptions {
  width: number;
  height: number;
  /** GIF frame rate — defaults to 10fps (GIFs should be lightweight) */
  fps?: number;
  /** Max colors per frame — lower = smaller file. Default 64. */
  maxColors?: number;
  onProgress?: (pct: number) => void;
}

/**
 * Exports the scene as an animated GIF.
 * Returns a Blob containing the GIF file.
 */
export async function exportGif(
  scene: SceneData,
  image: HTMLImageElement,
  mask: Mask | null,
  options: GifExportOptions,
): Promise<Blob> {
  const { width, height, onProgress } = options;
  const ec = await prepareExportContext(scene, image, mask, width, height);

  const gifFps = options.fps ?? 10;
  const maxColors = options.maxColors ?? 64;
  const duration = scene.playback.duration || 10;
  const totalFrames = Math.round(duration * gifFps);
  const dt = 1 / gifFps;
  const frameDelay = Math.round(100 / gifFps);

  const gif = GIFEncoder();

  for (let f = 0; f < totalFrames; f++) {
    const time = f * dt;

    renderFrame(ec, dt, time);

    // Encode frame
    const imageData = ec.ctx.getImageData(0, 0, width, height);
    const palette = quantize(imageData.data, maxColors);
    const index = applyPalette(imageData.data, palette);
    gif.writeFrame(index, width, height, {
      palette,
      delay: frameDelay,
      repeat: scene.playback.loop ? 0 : -1,
    });

    // Yield to keep UI responsive
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    onProgress?.(f / totalFrames);
  }

  gif.finish();
  onProgress?.(1);

  const buffer = gif.bytesView();
  return new Blob([buffer], { type: "image/gif" });
}
