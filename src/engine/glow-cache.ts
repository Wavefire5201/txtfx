/**
 * Glow sprite cache — pre-renders radial gradients as small offscreen canvases.
 * Instead of calling createRadialGradient() per cell per frame (the #1 bottleneck),
 * we render each unique (color, radius, brightness) combo once and reuse via drawImage().
 */

const BRIGHTNESS_LEVELS = 16; // quantize brightness to 16 steps for smooth transitions
const cache = new Map<string, OffscreenCanvas | HTMLCanvasElement>();

function quantize(value: number): number {
  return Math.round(value * (BRIGHTNESS_LEVELS - 1)) / (BRIGHTNESS_LEVELS - 1);
}

function makeKey(r: number, g: number, b: number, radius: number, brightness: number): string {
  return `${r},${g},${b},${radius},${brightness}`;
}

export function getGlowSprite(
  cR: number,
  cG: number,
  cB: number,
  radius: number,
  brightness: number,
): OffscreenCanvas | HTMLCanvasElement {
  const qBright = quantize(brightness);
  const qRadius = Math.round(radius);
  if (qRadius <= 0) return getGlowSprite(cR, cG, cB, 1, brightness);

  const key = makeKey(cR, cG, cB, qRadius, qBright);
  const existing = cache.get(key);
  if (existing) return existing;

  const size = qRadius * 2;
  let sprite: OffscreenCanvas | HTMLCanvasElement;
  try {
    sprite = new OffscreenCanvas(size, size);
  } catch {
    sprite = document.createElement("canvas");
    sprite.width = size;
    sprite.height = size;
  }

  const ctx = sprite.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
  if (!ctx) return sprite;

  const grad = ctx.createRadialGradient(qRadius, qRadius, 0, qRadius, qRadius, qRadius);
  grad.addColorStop(0, `rgba(${cR},${cG},${cB},${qBright * 0.7})`);
  grad.addColorStop(0.4, `rgba(${cR},${cG},${cB},${qBright * 0.28})`);
  grad.addColorStop(1, `rgba(${cR},${cG},${cB},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  cache.set(key, sprite);
  return sprite;
}

/** Clear cache when scene changes significantly (e.g., all effects removed) */
export function clearGlowCache(): void {
  cache.clear();
}

/** Current cache size for debug overlay */
export function glowCacheSize(): number {
  return cache.size;
}
