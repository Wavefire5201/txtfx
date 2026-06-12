import type { AsciiEffect, GridInfo, MaskGrid } from "./effects/types";
import type { MaskRegion } from "./effects/types";
import { CellBuffer, NO_COLOR, packedToHex } from "./cell-buffer";

export interface ActiveEffect {
  instance: AsciiEffect;
  maskRegion: MaskRegion;
  enabled: boolean;
  timelineStart: number;
  timelineEnd: number | null;
  mode: "continuous" | "one-shot";
  applyToAscii: boolean;
}

export interface GlowCell {
  row: number;
  col: number;
  char: string;
  color: string;
  brightness: number;
  glowRadius?: number;
  /** true when this cell came from an applyToAscii effect (render in DOM overlay) */
  asciiOverlay?: boolean;
}

export interface CompositeResult {
  text: string;
  glowCells: GlowCell[];
  glowCount: number;
  /** Zero-copy views of the composited grid (set when exposeBuffers). Valid until the next compositeFrame call. */
  buffers?: CompositeBuffers;
}

export interface CompositeBuffers {
  /** Winning cell code point per grid cell, 0 = none. */
  cellCodes: Uint32Array;
  /** Packed 0xFFRRGGBB per cell, 0 = uncolored. */
  cellColors: Uint32Array;
  /** Base char code point for applyToAscii winners (these cells are base-text holes), 0 = none. */
  asciiCodes: Uint32Array;
  brightness: Float32Array;
  /** Glow radius per cell, -1 = effect default. */
  glowRadius: Float64Array;
}

export interface CompositeOptions {
  /**
   * Build the plain-text frame (cols×rows string). The terminal/text export
   * paths need it; the editor preview and canvas export paths only consume
   * glowCells, and the join costs ~a 12k-char string per frame.
   */
  buildText?: boolean;
  /**
   * Leave colored cells as spaces in the text frame. The standalone player's
   * text layer only shows uncolored chars — colored ones render on its glow
   * canvas, and including them in both would double the glyphs.
   */
  textExcludesColored?: boolean;
  /** Expose zero-copy views of the composited grid (GL renderer hot path). */
  exposeBuffers?: boolean;
}

// Reusable buffers - resized only when grid dimensions change
let _cachedCols = 0;
let _cachedRows = 0;
let _brightMap = new Float32Array(0);
let _cellCodes = new Uint32Array(0); // winning cell's code point, 0 = none
let _cellColors = new Uint32Array(0); // packed color, 0 = none
let _asciiCodes = new Uint32Array(0); // base char code point for applyToAscii, 0 = none
let _radiusVals = new Float64Array(0); // -1 = no custom radius (f64: keep effect values exact)
let _cachedBaseText = "";
let _cachedBaseLines: string[] = [];
let _textBuf: string[] = [];

// Scratch buffer effects write into (cleared per effect per frame)
const _scratch = new CellBuffer(1024);

// Boundary memos: code points / packed colors become strings only here.
const _charMemo = new Map<number, string>();
function codeToChar(code: number): string {
  let s = _charMemo.get(code);
  if (s === undefined) {
    s = String.fromCodePoint(code);
    if (_charMemo.size < 4096) _charMemo.set(code, s);
  }
  return s;
}
const _hexMemo = new Map<number, string>();
function colorToHex(packed: number): string {
  let s = _hexMemo.get(packed);
  if (s === undefined) {
    s = packedToHex(packed);
    if (_hexMemo.size >= 4096) _hexMemo.clear();
    _hexMemo.set(packed, s);
  }
  return s;
}

const _glowPool: GlowCell[] = [];
let _glowCount = 0;

/**
 * Composites effect cells into glow cells for rendering.
 * Filters cells based on mask region, resolves overlaps by brightness.
 */
export function compositeFrame(
  effects: ActiveEffect[],
  dt: number,
  time: number,
  mask: MaskGrid,
  grid: GridInfo,
  baseText?: string,
  options: CompositeOptions = {}
): CompositeResult {
  const buildText = options.buildText ?? true;
  const { cols, rows } = grid;
  const total = cols * rows;

  // Resize buffers only when grid changes
  if (cols !== _cachedCols || rows !== _cachedRows) {
    _cachedCols = cols;
    _cachedRows = rows;
    _brightMap = new Float32Array(total);
    _cellCodes = new Uint32Array(total);
    _cellColors = new Uint32Array(total);
    _asciiCodes = new Uint32Array(total);
    _radiusVals = new Float64Array(total);
    _radiusVals.fill(-1);
  } else {
    _brightMap.fill(0);
    _cellCodes.fill(0);
    _cellColors.fill(0);
    _asciiCodes.fill(0);
    _radiusVals.fill(-1);
  }

  // Cache baseText split
  if (baseText !== _cachedBaseText) {
    _cachedBaseText = baseText || "";
    _cachedBaseLines = _cachedBaseText ? _cachedBaseText.split("\n") : [];
  }

  const brightMap = _brightMap;
  const cellCodes = _cellCodes;
  const cellColors = _cellColors;
  const asciiCodes = _asciiCodes;
  const radiusVals = _radiusVals;
  const baseLines = _cachedBaseLines;

  for (const fx of effects) {
    if (!fx.enabled) continue;

    if (time < fx.timelineStart) continue;
    if (fx.timelineEnd !== null && time > fx.timelineEnd) continue;

    let effectTime = time - fx.timelineStart;
    // Handle per-effect looping
    if (fx.mode === "continuous" && fx.timelineEnd !== null) {
      const effectDuration = fx.timelineEnd - fx.timelineStart;
      if (effectDuration > 0) {
        effectTime = effectTime % effectDuration;
      }
    }
    _scratch.clear();
    fx.instance.update(dt, effectTime, mask, _scratch);

    const n = _scratch.length;
    const sRows = _scratch.rows, sCols = _scratch.cols, sCodes = _scratch.codes;
    const sBright = _scratch.brightness, sColors = _scratch.colors, sGlow = _scratch.glowRadius;
    for (let i = 0; i < n; i++) {
      const row = sRows[i];
      const col = sCols[i];
      if (row < 0 || row >= rows || col < 0 || col >= cols) continue;

      const maskVal = mask.get(row, col);
      if (fx.maskRegion === "background" && maskVal < 0.5) continue;
      if (fx.maskRegion === "foreground" && maskVal >= 0.5) continue;

      const idx = row * cols + col;
      const brightness = sBright[i];

      if (fx.applyToAscii) {
        // Colorize existing ASCII character instead of drawing effect's own char
        const baseCh = baseLines[row]?.[col];
        if (!baseCh || baseCh === " ") continue; // skip empty positions
        if (brightness > brightMap[idx]) {
          brightMap[idx] = brightness;
          if (sColors[i] !== NO_COLOR) cellColors[idx] = sColors[i];
          radiusVals[idx] = sGlow[i];
          asciiCodes[idx] = baseCh.codePointAt(0)!;
        }
      } else {
        if (brightness > brightMap[idx]) {
          brightMap[idx] = brightness;
          cellCodes[idx] = sCodes[i];
          if (sColors[i] !== NO_COLOR) cellColors[idx] = sColors[i];
          radiusVals[idx] = sGlow[i];
        }
      }
    }
  }

  // Build plain text output using pre-allocated buffer (opt-in)
  let text = "";
  if (buildText) {
    const needed = cols * rows + (rows - 1);
    if (_textBuf.length < needed) {
      _textBuf = new Array(needed);
    }
    const excludeColored = options.textExcludesColored ?? false;
    let pos = 0;
    for (let r = 0; r < rows; r++) {
      if (r > 0) _textBuf[pos++] = "\n";
      const base = r * cols;
      for (let c = 0; c < cols; c++) {
        const idx = base + c;
        const code = cellCodes[idx];
        _textBuf[pos++] =
          code === 0 || (excludeColored && cellColors[idx] !== NO_COLOR) ? " " : codeToChar(code);
      }
    }
    const savedLen = _textBuf.length;
    _textBuf.length = pos;
    text = _textBuf.join("");
    _textBuf.length = savedLen;
  }

  // Collect cells with color for glow rendering (pooled)
  _glowCount = 0;
  for (let i = 0; i < cols * rows; i++) {
    const packed = cellColors[i];
    if (packed !== NO_COLOR) {
      const glowCode = asciiCodes[i] > 0 ? asciiCodes[i] : cellCodes[i];
      if (glowCode !== 0) {
        let gc = _glowPool[_glowCount];
        if (!gc) {
          gc = { row: 0, col: 0, char: "", color: "", brightness: 0 };
          _glowPool[_glowCount] = gc;
        }
        gc.row = Math.floor(i / cols);
        gc.col = i % cols;
        gc.char = codeToChar(glowCode);
        gc.color = colorToHex(packed);
        gc.brightness = brightMap[i];
        gc.glowRadius = radiusVals[i] >= 0 ? radiusVals[i] : undefined;
        gc.asciiOverlay = asciiCodes[i] > 0;
        _glowCount++;
      }
    }
  }

  const result: CompositeResult = { text, glowCells: _glowPool, glowCount: _glowCount };
  if (options.exposeBuffers) {
    result.buffers = {
      cellCodes,
      cellColors,
      asciiCodes,
      brightness: brightMap,
      glowRadius: radiusVals,
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Hole-punching helpers (applyToAscii cells replace base text chars).
// Pure functions so the editor's frame loop logic is unit-testable.
// ---------------------------------------------------------------------------

/** Collects base-text hole positions (row*cols+col) from composited cells. */
export function collectHoles(glowCells: GlowCell[], glowCount: number, cols: number): Set<number> {
  const holes = new Set<number>();
  for (let i = 0; i < glowCount; i++) {
    const cell = glowCells[i];
    if (cell.asciiOverlay) holes.add(cell.row * cols + cell.col);
  }
  return holes;
}

/** True when the hole set differs from the previous frame's. */
export function holesChanged(prev: Set<number>, next: Set<number>): boolean {
  if (prev.size !== next.size) return true;
  for (const idx of next) {
    if (!prev.has(idx)) return true;
  }
  return false;
}

/**
 * Returns base text with hole positions replaced by spaces, normalized to
 * cols×rows (lines padded/truncated like the renderer's layout).
 */
export function punchHoles(baseLines: string[], holes: Set<number>, cols: number, rows: number): string {
  const parts: string[] = [];
  for (let r = 0; r < rows; r++) {
    if (r > 0) parts.push("\n");
    const line = baseLines[r] || "";
    let rowHasHoles = false;
    for (let c = 0; c < cols; c++) {
      if (holes.has(r * cols + c)) {
        rowHasHoles = true;
        break;
      }
    }
    if (!rowHasHoles) {
      parts.push(line.padEnd(cols, " ").slice(0, cols));
    } else {
      for (let c = 0; c < cols; c++) {
        parts.push(holes.has(r * cols + c) ? " " : (line[c] || " "));
      }
    }
  }
  return parts.join("");
}
