import type { GridInfo } from "./effects/types";

const DEFAULT_RAMP = " .`,:;cbaO0%#@";

export interface AsciiConfig {
  ramp?: string;
  gamma?: number;
}

export interface AsciiResult {
  text: string;
  grid: GridInfo;
}

/**
 * Measures character dimensions from a container's computed style.
 * Returns cols/rows that fit inside the container.
 */
export function measureGrid(container: HTMLElement): GridInfo {
  const style = getComputedStyle(container);
  const fontSize = parseFloat(style.fontSize);

  // line-height handling: getComputedStyle may return a unitless value (e.g. "0.78"
  // on Firefox) or a pixel value (e.g. "8.58px" on Chrome) or "normal". Normalize
  // to pixels so downstream math is always in consistent units.
  const lineHeightStr = style.lineHeight;
  let lineHeight: number;
  if (lineHeightStr === "normal") {
    lineHeight = fontSize * 1.2; // browser default
  } else {
    const parsed = parseFloat(lineHeightStr);
    if (lineHeightStr.endsWith("px")) {
      lineHeight = parsed;
    } else {
      // Unitless multiplier — convert to pixels
      lineHeight = parsed * fontSize;
    }
  }

  const padLeft = parseFloat(style.paddingLeft) || 0;
  const padRight = parseFloat(style.paddingRight) || 0;
  const padTop = parseFloat(style.paddingTop) || 0;
  const padBottom = parseFloat(style.paddingBottom) || 0;

  // Measure actual character width by appending a span INSIDE the container
  // (inherits the exact same font context — CSS variables, inherited properties)
  const span = document.createElement("span");
  span.style.position = "absolute";
  span.style.visibility = "hidden";
  span.style.whiteSpace = "pre";
  span.textContent = "X".repeat(20);
  container.appendChild(span);
  const charW = span.getBoundingClientRect().width / 20;
  container.removeChild(span);

  const charH = lineHeight;
  const rect = container.getBoundingClientRect();
  const cols = Math.floor((rect.width - padLeft - padRight) / charW);
  const rows = Math.floor((rect.height - padTop - padBottom) / charH);
  return { cols, rows, charW, charH, fontSize };
}

/**
 * Converts an image to an ASCII string by sampling luminance per cell.
 * Uses cover-crop logic to fill the grid without distortion.
 */
export function imageToAscii(
  img: HTMLImageElement | HTMLCanvasElement,
  grid: GridInfo,
  config: AsciiConfig = {}
): string {
  const { cols, rows } = grid;
  if (cols <= 0 || rows <= 0) return "";

  const ramp = config.ramp ?? DEFAULT_RAMP;
  const gamma = config.gamma ?? 1.0;

  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d")!;

  // Cover-crop: fill cols×rows without distortion
  const imgW = img instanceof HTMLCanvasElement ? img.width : img.naturalWidth;
  const imgH = img instanceof HTMLCanvasElement ? img.height : img.naturalHeight;
  const imgAspect = imgW / imgH;
  const cellAspect = cols / rows;
  let sx = 0, sy = 0, sw = imgW, sh = imgH;
  if (imgAspect > cellAspect) {
    sw = imgH * cellAspect;
    sx = (imgW - sw) / 2;
  } else {
    sh = imgW / cellAspect;
    sy = (imgH - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);
  const { data } = ctx.getImageData(0, 0, cols, rows);

  let out = "";
  for (let y = 0; y < rows; y++) {
    let line = "";
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      const adjusted = Math.pow(1 - lum, gamma);
      line += ramp[Math.floor(adjusted * (ramp.length - 1))];
    }
    out += line + "\n";
  }
  return out;
}

/**
 * Samples a 32×32 downscale of the image and returns the mean RGB color.
 */
export function sampleMeanColor(img: HTMLImageElement): [number, number, number] {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  try {
    ctx.drawImage(img, 0, 0, 32, 32);
    const d = ctx.getImageData(0, 0, 32, 32).data;
    let r = 0, g = 0, b = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]; g += d[i + 1]; b += d[i + 2];
    }
    return [(r / n) | 0, (g / n) | 0, (b / n) | 0];
  } catch {
    return [40, 40, 50];
  }
}
