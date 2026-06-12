/**
 * Struct-of-arrays buffer that effects write cells into each frame.
 *
 * Replaces per-cell object literals ({row, col, char, color, ...}) that
 * created ~100k short-lived allocations/second at 60fps. Colors are packed
 * u32s (hex strings parsed once in effect init); characters are Unicode
 * CODE POINTS, not UTF-16 units — "🔥" is one cell, not two broken halves.
 *
 * This layout is intentionally the shape a WebGL instance buffer wants.
 */

export const NO_COLOR = 0;
export const NO_GLOW = -1;

/** Packs r/g/b (0-255) with full alpha: 0xFFRRGGBB. Never collides with NO_COLOR. */
export function packRGB(r: number, g: number, b: number): number {
  return ((0xff << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)) >>> 0;
}

export class CellBuffer {
  length = 0;
  rows: Int16Array;
  cols: Int16Array;
  /** Unicode code points (use String.fromCodePoint to display). */
  codes: Uint32Array;
  /** Float64: snapshot/equality semantics must match JS doubles exactly. */
  brightness: Float64Array;
  /** Packed 0xFFRRGGBB colors; NO_COLOR (0) = uncolored cell. */
  colors: Uint32Array;
  /** Glow radius in px; NO_GLOW (-1) = effect default. Float64, see above. */
  glowRadius: Float64Array;

  constructor(capacity = 256) {
    this.rows = new Int16Array(capacity);
    this.cols = new Int16Array(capacity);
    this.codes = new Uint32Array(capacity);
    this.brightness = new Float64Array(capacity);
    this.colors = new Uint32Array(capacity);
    this.glowRadius = new Float64Array(capacity);
  }

  clear(): void {
    this.length = 0;
  }

  push(row: number, col: number, code: number, brightness: number, color = NO_COLOR, glowRadius = NO_GLOW): void {
    if (this.length === this.rows.length) this.grow();
    const i = this.length++;
    this.rows[i] = row;
    this.cols[i] = col;
    this.codes[i] = code;
    this.brightness[i] = brightness;
    this.colors[i] = color;
    this.glowRadius[i] = glowRadius;
  }

  private grow(): void {
    const capacity = this.rows.length * 2;
    const rows = new Int16Array(capacity); rows.set(this.rows); this.rows = rows;
    const cols = new Int16Array(capacity); cols.set(this.cols); this.cols = cols;
    const codes = new Uint32Array(capacity); codes.set(this.codes); this.codes = codes;
    const brightness = new Float64Array(capacity); brightness.set(this.brightness); this.brightness = brightness;
    const colors = new Uint32Array(capacity); colors.set(this.colors); this.colors = colors;
    const glowRadius = new Float64Array(capacity); glowRadius.set(this.glowRadius); this.glowRadius = glowRadius;
  }
}

/** Readable cell shape for tests/debugging — NOT used in hot paths. */
export interface ExtractedCell {
  row: number;
  col: number;
  char: string;
  brightness: number;
  color?: string;
  glowRadius?: number;
}

export function packedToHex(packed: number): string {
  const r = (packed >>> 16) & 0xff;
  const g = (packed >>> 8) & 0xff;
  const b = packed & 0xff;
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function cellBufferToArray(buf: CellBuffer): ExtractedCell[] {
  const out: ExtractedCell[] = [];
  for (let i = 0; i < buf.length; i++) {
    const cell: ExtractedCell = {
      row: buf.rows[i],
      col: buf.cols[i],
      char: String.fromCodePoint(buf.codes[i]),
      brightness: buf.brightness[i],
    };
    if (buf.colors[i] !== NO_COLOR) cell.color = packedToHex(buf.colors[i]);
    if (buf.glowRadius[i] !== NO_GLOW) cell.glowRadius = buf.glowRadius[i];
    out.push(cell);
  }
  return out;
}
