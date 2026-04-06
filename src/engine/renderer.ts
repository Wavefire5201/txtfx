import type { AsciiEffect, GridInfo, MaskGrid, EffectCell } from "./effects/types";
import type { MaskRegion } from "./effects/types";

export interface ActiveEffect {
  instance: AsciiEffect;
  maskRegion: MaskRegion;
  enabled: boolean;
  timelineStart: number;
  timelineEnd: number | null;
  loop: boolean;
  applyToAscii: boolean;
}

export interface GlowCell {
  row: number;
  col: number;
  char: string;
  color: string;
  brightness: number;
  glowRadius?: number;
}

export interface CompositeResult {
  text: string;
  glowCells: GlowCell[];
}

/**
 * Composites effect cells into a sparkle overlay string.
 * Filters cells based on mask region, resolves overlaps by brightness.
 */
export function compositeFrame(
  effects: ActiveEffect[],
  dt: number,
  time: number,
  mask: MaskGrid,
  grid: GridInfo,
  baseText?: string
): CompositeResult {
  const { cols, rows } = grid;
  const brightMap = new Float32Array(cols * rows);
  const charMap = new Uint8Array(cols * rows);
  const colorMap: (string | undefined)[] = new Array(cols * rows);
  const applyToAsciiMap: (string | undefined)[] = new Array(cols * rows);
  const glowRadiusMap: (number | undefined)[] = new Array(cols * rows);
  const baseLines = baseText ? baseText.split("\n") : [];
  const chars: string[] = [" "];
  const charIndex = new Map<string, number>();
  charIndex.set(" ", 0);

  function getCharIdx(ch: string): number {
    let idx = charIndex.get(ch);
    if (idx === undefined) {
      idx = chars.length;
      chars.push(ch);
      charIndex.set(ch, idx);
    }
    return idx;
  }

  for (const fx of effects) {
    if (!fx.enabled) continue;

    if (time < fx.timelineStart) continue;
    if (fx.timelineEnd !== null && time > fx.timelineEnd) continue;

    const effectTime = time - fx.timelineStart;
    const cells = fx.instance.update(dt, effectTime, mask);

    for (const cell of cells) {
      const { row, col, char, brightness = 0.5, color } = cell;
      if (row < 0 || row >= rows || col < 0 || col >= cols) continue;

      const maskVal = mask.get(row, col);
      if (fx.maskRegion === "background" && maskVal < 0.5) continue;
      if (fx.maskRegion === "foreground" && maskVal >= 0.5) continue;

      const idx = row * cols + col;

      if (fx.applyToAscii) {
        // Colorize existing ASCII character instead of drawing effect's own char
        const baseCh = baseLines[row]?.[col];
        if (!baseCh || baseCh === " ") continue; // skip empty positions
        if (brightness > brightMap[idx]) {
          brightMap[idx] = brightness;
          // Don't write to charMap — keep sparkle layer empty at this cell
          colorMap[idx] = color;
          glowRadiusMap[idx] = cell.glowRadius;
          // Store the base char for glow rendering
          applyToAsciiMap[idx] = baseCh;
        }
      } else {
        if (brightness > brightMap[idx]) {
          brightMap[idx] = brightness;
          charMap[idx] = getCharIdx(char);
          colorMap[idx] = color;
          glowRadiusMap[idx] = cell.glowRadius;
        }
      }
    }
  }

  // Build plain text output
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      line += chars[charMap[r * cols + c]];
    }
    lines.push(line);
  }

  // Collect cells with color for glow rendering
  const glowCells: GlowCell[] = [];
  for (let i = 0; i < cols * rows; i++) {
    if (colorMap[i]) {
      const glowChar = applyToAsciiMap[i] || (charMap[i] !== 0 ? chars[charMap[i]] : undefined);
      if (glowChar) {
        glowCells.push({
          row: Math.floor(i / cols),
          col: i % cols,
          char: glowChar,
          color: colorMap[i]!,
          brightness: brightMap[i],
          glowRadius: glowRadiusMap[i],
        });
      }
    }
  }

  return { text: lines.join("\n"), glowCells };
}
