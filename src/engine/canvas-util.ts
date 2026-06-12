/**
 * Environment-agnostic canvas helpers — work on the main thread (DOM canvas)
 * and inside workers (OffscreenCanvas). The export pipeline runs in both.
 */

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type AnyCtx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/** Image-ish sources the export pipeline accepts. */
export type ImageLike = HTMLImageElement | ImageBitmap | HTMLCanvasElement | OffscreenCanvas;

export function createAnyCanvas(width: number, height: number): AnyCanvas {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return new OffscreenCanvas(width, height);
}

export function get2d(canvas: AnyCanvas): AnyCtx2D {
  const ctx = (canvas as HTMLCanvasElement).getContext("2d") as AnyCtx2D | null;
  if (!ctx) throw new Error("Could not acquire 2d canvas context");
  return ctx;
}

/** Width/height for HTMLImageElement (natural*) and bitmap/canvas sources alike. */
export function getImageSize(img: ImageLike): { width: number; height: number } {
  const maybe = img as { naturalWidth?: number; naturalHeight?: number; width: number; height: number };
  return {
    width: maybe.naturalWidth || maybe.width,
    height: maybe.naturalHeight || maybe.height,
  };
}

/**
 * Returns a canvas-backed copy of the source (canvases pass through).
 *
 * Chromium resamples HTMLImageElement sources differently than canvas/bitmap
 * sources in drawImage — enough to flip ASCII ramp chars at luminance
 * boundaries when downscaling. Routing every consumer through a canvas source
 * makes sampling deterministic across the editor, main-thread export, and the
 * export worker.
 */
export function normalizeToCanvasSource(img: ImageLike): AnyCanvas {
  if (typeof HTMLCanvasElement !== "undefined" && img instanceof HTMLCanvasElement) return img;
  if (typeof OffscreenCanvas !== "undefined" && img instanceof OffscreenCanvas) return img;
  const { width, height } = getImageSize(img);
  const canvas = createAnyCanvas(width, height);
  get2d(canvas).drawImage(img, 0, 0);
  return canvas;
}

export function canvasToBlob(canvas: AnyCanvas, type?: string, quality?: number): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode canvas to blob"))),
      type,
      quality,
    );
  });
}
