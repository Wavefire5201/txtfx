/**
 * Canvas renderer for effect cells — glow sprites + colored glyphs.
 *
 * Replaces the editor's DOM overlay (per-cell <span> with text-shadow inside
 * a <pre>), which forced HTML parse + style + full-text layout + two blurred
 * shadow paints per glyph EVERY frame. Mirrors the export pipeline's
 * rendering (video.ts renderFrame passes 2 and 3) so editor and export look
 * the same.
 */
import type { GlowCell } from "./renderer";
import { getGlowSprite } from "./glow-cache";
import type { AnyCtx2D } from "./canvas-util";

export interface EffectCanvasLayout {
  /** Pixel offset of the grid origin (the <pre>'s padding). */
  padLeft: number;
  padTop: number;
  charW: number;
  charH: number;
  /** Canvas font string, e.g. `700 12px monospace`. */
  font: string;
}

function parseHexChannel(color: string, start: number): number {
  return parseInt(color.slice(start, start + 2), 16) || 0;
}

/**
 * Draws glow sprites + effect glyphs for cells [0, count).
 * The context must already be cleared and DPR-transformed by the caller.
 */
export function drawEffectCells(
  ctx: AnyCtx2D,
  glowCells: GlowCell[],
  count: number,
  layout: EffectCanvasLayout,
): void {
  const { padLeft, padTop, charW, charH, font } = layout;

  // Pass 1: glow sprites (cached radial gradients)
  let prevHex = "";
  let cR = 0, cG = 0, cB = 0;
  for (let i = 0; i < count; i++) {
    const cell = glowCells[i];
    const radius = cell.glowRadius ?? 18;
    if (radius <= 0) continue;
    if (cell.color !== prevHex) {
      prevHex = cell.color;
      cR = parseHexChannel(cell.color, 1);
      cG = parseHexChannel(cell.color, 3);
      cB = parseHexChannel(cell.color, 5);
    }
    const cx = padLeft + cell.col * charW + charW * 0.5;
    const cy = padTop + cell.row * charH + charH * 0.5;
    const sprite = getGlowSprite(cR, cG, cB, radius, cell.brightness);
    ctx.drawImage(sprite, cx - radius, cy - radius, radius * 2, radius * 2);
  }

  // Pass 2: glyphs
  ctx.font = font;
  ctx.textBaseline = "top";
  prevHex = "";
  for (let i = 0; i < count; i++) {
    const cell = glowCells[i];
    if (cell.color !== prevHex) {
      prevHex = cell.color;
      ctx.fillStyle = cell.color;
    }
    ctx.globalAlpha = Math.min(1, cell.brightness * 0.95);
    ctx.fillText(cell.char, padLeft + cell.col * charW, padTop + cell.row * charH);
  }
  ctx.globalAlpha = 1;
}
