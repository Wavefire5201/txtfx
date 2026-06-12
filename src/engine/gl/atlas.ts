/**
 * Glyph atlas: rasterizes glyphs once (2D scratch canvas) into a texture,
 * keyed by Unicode code point. Cells include a margin so ascenders/descenders
 * that overflow the grid cell (lineHeight < 1) render exactly like fillText.
 *
 * Rasterized at devicePixelRatio; quads are sized from the atlas cell so
 * texels map 1:1 to physical pixels (no resampling blur).
 */
import { createAnyCanvas, get2d, type AnyCanvas, type AnyCtx2D } from "../canvas-util";

const MAX_TEXTURE_DIM = 2048;

export interface AtlasFont {
  /** Font size in CSS px (the grid's fontSize). */
  fontSize: number;
  fontFamily: string;
  /** Cell advance/height in CSS px (charW/charH from the grid). */
  charW: number;
  charH: number;
  dpr: number;
}

export class GlyphAtlas {
  readonly texture: WebGLTexture;
  /** Atlas cell size in raster (physical) px. */
  cellPxW = 0;
  cellPxH = 0;
  /** Ink margin inside each cell, raster px. */
  padPx = 0;
  /** Slots per atlas row/column. */
  slotCols = 0;
  slotRows = 0;

  private slots = new Map<number, number>();
  private nextSlot = 0;
  private scratch: AnyCanvas;
  private scratchCtx: AnyCtx2D;
  private font: AtlasFont = { fontSize: 12, fontFamily: "monospace", charW: 7, charH: 12, dpr: 1 };
  private texW = 0;
  private texH = 0;

  constructor(private readonly gl: WebGL2RenderingContext, font: AtlasFont) {
    const texture = gl.createTexture();
    if (!texture) throw new Error("glyph atlas: could not create texture");
    this.texture = texture;
    this.scratch = createAnyCanvas(1, 1);
    this.scratchCtx = get2d(this.scratch);
    this.configure(font);
  }

  /** (Re)configures for a font — clears all slots and reallocates the texture. */
  configure(font: AtlasFont): void {
    this.font = font;
    const { gl } = this;
    this.padPx = Math.ceil(font.fontSize * 0.6 * font.dpr);
    this.cellPxW = Math.ceil(font.charW * font.dpr) + this.padPx * 2;
    this.cellPxH = Math.ceil(font.charH * font.dpr) + this.padPx * 2;
    this.slotCols = Math.max(1, Math.floor(MAX_TEXTURE_DIM / this.cellPxW));
    this.slotRows = Math.max(1, Math.floor(MAX_TEXTURE_DIM / this.cellPxH));
    this.texW = this.slotCols * this.cellPxW;
    this.texH = this.slotRows * this.cellPxH;
    this.slots.clear();
    this.nextSlot = 0;

    this.scratch.width = this.cellPxW;
    this.scratch.height = this.cellPxH;
    this.scratchCtx = get2d(this.scratch);

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.texW, this.texH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  get capacity(): number {
    return this.slotCols * this.slotRows;
  }

  /** Slot for a code point; rasterizes + uploads on first sight. */
  slotOf(code: number): number {
    let slot = this.slots.get(code);
    if (slot !== undefined) return slot;

    if (this.nextSlot >= this.capacity) {
      // Pathological glyph diversity (custom-emitter spam). Restart the atlas;
      // active glyphs re-rasterize on demand next frames.
      console.warn("[txtfx gl] glyph atlas full — resetting");
      this.slots.clear();
      this.nextSlot = 0;
    }
    slot = this.nextSlot++;
    this.slots.set(code, slot);

    const { gl, scratchCtx: ctx, font } = this;
    ctx.clearRect(0, 0, this.cellPxW, this.cellPxH);
    ctx.font = `700 ${font.fontSize * font.dpr}px ${font.fontFamily}`;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(String.fromCodePoint(code), this.padPx, this.padPx);

    const x = (slot % this.slotCols) * this.cellPxW;
    const y = Math.floor(slot / this.slotCols) * this.cellPxH;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, this.scratch as TexImageSource);
    return slot;
  }

  /** Pre-rasterizes a string's unique code points (first-frame warmup). */
  warm(text: string): void {
    for (const ch of text) this.slotOf(ch.codePointAt(0)!);
  }

  /** UV scale of one cell (cell px / texture px). */
  get cellUv(): [number, number] {
    return [this.cellPxW / this.texW, this.cellPxH / this.texH];
  }

  dispose(): void {
    this.gl.deleteTexture(this.texture);
    this.slots.clear();
  }
}
