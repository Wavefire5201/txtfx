import type { AsciiEffect, GridInfo, MaskGrid, EffectCell } from "./effects/types";
import type { MaskRegion } from "./effects/types";

export interface ActiveEffect {
  instance: AsciiEffect;
  maskRegion: MaskRegion;
  enabled: boolean;
  timelineStart: number;
  timelineEnd: number | null;
  loop: boolean;
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
  grid: GridInfo
): string {
  const { cols, rows } = grid;
  // Track best char per cell
  const brightMap = new Float32Array(cols * rows);
  const charMap = new Uint8Array(cols * rows); // index into a char array
  const chars: string[] = [" "]; // index 0 = space
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

    // Check timeline
    if (time < fx.timelineStart) continue;
    if (fx.timelineEnd !== null && time > fx.timelineEnd) continue;

    const effectTime = time - fx.timelineStart;
    const cells = fx.instance.update(dt, effectTime, mask);

    for (const cell of cells) {
      const { row, col, char, brightness = 0.5 } = cell;
      if (row < 0 || row >= rows || col < 0 || col >= cols) continue;

      // Check mask region
      const maskVal = mask.get(row, col);
      if (fx.maskRegion === "background" && maskVal < 0.5) continue;
      if (fx.maskRegion === "foreground" && maskVal >= 0.5) continue;

      const idx = row * cols + col;
      if (brightness > brightMap[idx]) {
        brightMap[idx] = brightness;
        charMap[idx] = getCharIdx(char);
      }
    }
  }

  // Build output string
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      line += chars[charMap[r * cols + c]];
    }
    lines.push(line);
  }
  return lines.join("\n");
}
