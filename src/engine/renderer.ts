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

// Reusable buffers - resized only when grid dimensions change
let _cachedCols = 0;
let _cachedRows = 0;
let _brightMap = new Float32Array(0);
let _charMap = new Uint8Array(0);
let _colorIndices = new Int16Array(0); // index into per-frame color table, -1 = no color
let _asciiCodes = new Uint16Array(0); // char code, 0 = none
let _radiusVals = new Float32Array(0); // 0 = no custom radius
let _cachedBaseText = "";
let _cachedBaseLines: string[] = [];
let _textBuf: string[] = [];


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
  const total = cols * rows;

  // Resize buffers only when grid changes
  if (cols !== _cachedCols || rows !== _cachedRows) {
    _cachedCols = cols;
    _cachedRows = rows;
    _brightMap = new Float32Array(total);
    _charMap = new Uint8Array(total);
    _colorIndices = new Int16Array(total);
    _asciiCodes = new Uint16Array(total);
    _radiusVals = new Float32Array(total);
    _colorIndices.fill(-1);
  } else {
    _brightMap.fill(0);
    _charMap.fill(0);
    _colorIndices.fill(-1);
    _asciiCodes.fill(0);
    _radiusVals.fill(0);
  }

  // Cache baseText split
  if (baseText !== _cachedBaseText) {
    _cachedBaseText = baseText || "";
    _cachedBaseLines = _cachedBaseText ? _cachedBaseText.split("\n") : [];
  }

  const brightMap = _brightMap;
  const charMap = _charMap;
  const colorIndices = _colorIndices;
  const asciiCodes = _asciiCodes;
  const radiusVals = _radiusVals;
  const baseLines = _cachedBaseLines;
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

  const colorTable: string[] = [];
  const colorLookup = new Map<string, number>();
  function getColorIdx(color: string): number {
    let idx = colorLookup.get(color);
    if (idx === undefined) {
      idx = colorTable.length;
      colorTable.push(color);
      colorLookup.set(color, idx);
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
          if (color) colorIndices[idx] = getColorIdx(color);
          radiusVals[idx] = cell.glowRadius ?? 0;
          asciiCodes[idx] = baseCh.charCodeAt(0);
        }
      } else {
        if (brightness > brightMap[idx]) {
          brightMap[idx] = brightness;
          charMap[idx] = getCharIdx(char);
          if (color) colorIndices[idx] = getColorIdx(color);
          radiusVals[idx] = cell.glowRadius ?? 0;
        }
      }
    }
  }

  // Build plain text output using pre-allocated buffer
  const needed = cols * rows + (rows - 1);
  if (_textBuf.length < needed) {
    _textBuf = new Array(needed);
  }
  let pos = 0;
  for (let r = 0; r < rows; r++) {
    if (r > 0) _textBuf[pos++] = "\n";
    const base = r * cols;
    for (let c = 0; c < cols; c++) {
      _textBuf[pos++] = chars[charMap[base + c]];
    }
  }
  const savedLen = _textBuf.length;
  _textBuf.length = pos;
  const text = _textBuf.join("");
  _textBuf.length = savedLen;

  // Collect cells with color for glow rendering
  const glowCells: GlowCell[] = [];
  for (let i = 0; i < cols * rows; i++) {
    const ci = colorIndices[i];
    if (ci >= 0) {
      const glowChar = asciiCodes[i] > 0
        ? String.fromCharCode(asciiCodes[i])
        : (charMap[i] !== 0 ? chars[charMap[i]] : undefined);
      if (glowChar) {
        glowCells.push({
          row: Math.floor(i / cols),
          col: i % cols,
          char: glowChar,
          color: colorTable[ci],
          brightness: brightMap[i],
          glowRadius: radiusVals[i] > 0 ? radiusVals[i] : undefined,
        });
      }
    }
  }

  return { text, glowCells };
}
