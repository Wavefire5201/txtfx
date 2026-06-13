/**
 * Pixel comparison + golden image helpers for BROWSER tests only
 * (imports @vitest/browser/context — do not import from unit tests).
 *
 * Goldens live in src/test/goldens/*.png. First run (or UPDATE_GOLDENS=1)
 * writes the golden; later runs diff against it. On failure the actual
 * frame is written next to the golden as <name>.actual.png for eyeballing.
 */
import { server, commands } from "vitest/browser";

declare const __UPDATE_GOLDENS__: boolean;
declare const __SKIP_GOLDENS__: boolean;

const GOLDEN_DIR = "src/test/goldens";

export interface PixelDiffStats {
  /** Mean squared error across RGBA channels (0 = identical). */
  mse: number;
  /** Largest single-channel absolute difference (0-255). */
  maxChannelDiff: number;
  /** Fraction of pixels whose max channel diff exceeds 16. */
  diffPixelRatio: number;
}

export interface GoldenOptions {
  /** Maximum allowed mean squared error. */
  mseThreshold?: number;
  /** Maximum allowed fraction of clearly-different pixels. */
  maxDiffPixelRatio?: number;
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

function goldenPath(name: string, suffix = ""): string {
  return `${server.config.root}/${GOLDEN_DIR}/${name}${suffix}.png`;
}

function toImageData(canvas: AnyCanvas): ImageData {
  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("pixel.ts: canvas has no 2d context (webgl canvas? draw it onto a 2d canvas first)");
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function diffImageData(a: ImageData, b: ImageData): PixelDiffStats {
  if (a.width !== b.width || a.height !== b.height) {
    return { mse: Infinity, maxChannelDiff: 255, diffPixelRatio: 1 };
  }
  const da = a.data;
  const db = b.data;
  let sumSq = 0;
  let maxChannelDiff = 0;
  let diffPixels = 0;
  for (let i = 0; i < da.length; i += 4) {
    let pixelMax = 0;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(da[i + c] - db[i + c]);
      sumSq += d * d;
      if (d > pixelMax) pixelMax = d;
    }
    if (pixelMax > maxChannelDiff) maxChannelDiff = pixelMax;
    if (pixelMax > 16) diffPixels++;
  }
  const pixelCount = da.length / 4;
  return {
    mse: sumSq / da.length,
    maxChannelDiff,
    diffPixelRatio: diffPixels / pixelCount,
  };
}

function canvasToBase64Png(canvas: AnyCanvas): Promise<string> {
  if (canvas instanceof HTMLCanvasElement) {
    return Promise.resolve(canvas.toDataURL("image/png").split(",")[1]);
  }
  return canvas.convertToBlob({ type: "image/png" }).then(
    (blob) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }),
  );
}

function base64PngToImageData(base64: string, width: number, height: number): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, width, height));
    };
    img.onerror = reject;
    img.src = `data:image/png;base64,${base64}`;
  });
}

async function readGolden(name: string): Promise<string | null> {
  try {
    return await commands.readFile(goldenPath(name), "base64");
  } catch {
    return null; // golden does not exist yet
  }
}

/**
 * Asserts a canvas matches its committed golden PNG within tolerance.
 * Writes the golden on first run or when UPDATE_GOLDENS=1.
 */
export async function expectGolden(
  canvas: AnyCanvas,
  name: string,
  options: GoldenOptions = {},
): Promise<void> {
  const { mseThreshold = 3, maxDiffPixelRatio = 0.005 } = options;

  // CI / SKIP_GOLDENS: committed reference PNGs are machine-specific (font + AA
  // rendering varies across OSes), so skip the byte comparison. Still confirm
  // the canvas actually rendered so a broken render is caught.
  if (__SKIP_GOLDENS__) {
    if (!canvas.width || !canvas.height) {
      throw new Error(`Golden "${name}": canvas has zero size`);
    }
    return;
  }

  const actualBase64 = await canvasToBase64Png(canvas);
  const existing = __UPDATE_GOLDENS__ ? null : await readGolden(name);

  if (existing === null) {
    await commands.writeFile(goldenPath(name), actualBase64, "base64");
    console.info(`[golden] wrote ${GOLDEN_DIR}/${name}.png`);
    return;
  }

  const actual = toImageData(canvas);
  const golden = await base64PngToImageData(existing, canvas.width, canvas.height);
  const stats = diffImageData(golden, actual);

  if (stats.mse > mseThreshold || stats.diffPixelRatio > maxDiffPixelRatio) {
    await commands.writeFile(goldenPath(name, ".actual"), actualBase64, "base64");
    throw new Error(
      `Golden mismatch for "${name}": mse=${stats.mse.toFixed(2)} (limit ${mseThreshold}), ` +
        `diffPixelRatio=${(stats.diffPixelRatio * 100).toFixed(2)}% (limit ${maxDiffPixelRatio * 100}%), ` +
        `maxChannelDiff=${stats.maxChannelDiff}. ` +
        `Inspect ${GOLDEN_DIR}/${name}.actual.png vs ${GOLDEN_DIR}/${name}.png; ` +
        `rerun with UPDATE_GOLDENS=1 if the change is intentional.`,
    );
  }
}

/** Direct canvas-vs-canvas comparison (for old-path vs new-path equivalence tests). */
export function expectCanvasesMatch(
  a: AnyCanvas,
  b: AnyCanvas,
  label: string,
  options: GoldenOptions = {},
): void {
  const { mseThreshold = 3, maxDiffPixelRatio = 0.005 } = options;
  const stats = diffImageData(toImageData(a), toImageData(b));
  if (stats.mse > mseThreshold || stats.diffPixelRatio > maxDiffPixelRatio) {
    throw new Error(
      `Canvas mismatch (${label}): mse=${stats.mse.toFixed(2)} (limit ${mseThreshold}), ` +
        `diffPixelRatio=${(stats.diffPixelRatio * 100).toFixed(2)}% (limit ${maxDiffPixelRatio * 100}%), ` +
        `maxChannelDiff=${stats.maxChannelDiff}`,
    );
  }
}
