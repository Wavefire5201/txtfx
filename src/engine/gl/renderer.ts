/**
 * WebGL2 instanced scene renderer — one canvas replaces the layered DOM
 * (backdrop image, base ASCII <pre>, effect glyphs, glow sprites).
 *
 * Per frame: rebuild three small instance arrays straight from the
 * compositor's SoA buffers (CPU cost ~tens of microseconds), upload, and
 * issue 4 draws: backdrop quad, base glyphs, glow quads, effect glyphs.
 *
 * Known approximations vs the Canvas2D path (documented, gated by tests):
 * - base-text shadowBlur halo (alpha 0.04) is omitted
 * - CSS blend modes other than screen/normal fall back to normal
 * - glow brightness is continuous instead of 16-step quantized
 */
import type { GridInfo } from "../effects/types";
import type { CompositeBuffers } from "../renderer";
import { getImageSize, type ImageLike } from "../canvas-util";
import { GlyphAtlas, type AtlasFont } from "./atlas";
import {
  QUAD_VERT_CORNERS,
  BACKDROP_VERT, BACKDROP_FRAG,
  GLYPH_VERT, GLYPH_FRAG,
  GLOW_VERT, GLOW_FRAG,
  compileProgram,
} from "./shaders";

export interface GlSceneOptions {
  /** Packed 0xFFRRGGBB base text color. */
  baseColor: number;
  /** 0..1 — combined ascii color alpha * opacity. */
  baseAlpha: number;
  /** "screen" and "normal" are exact; anything else renders as normal. */
  blendMode: string;
  /** Image opacity over the tint. Editor/player historically dim to ~0.86; exports use 1. Default 1. */
  backdropOpacity?: number;
  /** Packed 0xFFRRGGBB color under the dimmed image. Default black. */
  backdropTint?: number;
}

export interface GlFrame {
  grid: GridInfo;
  /** Per-cell base glyph code points, 0 = blank. */
  baseCodes: Uint32Array;
  composite: CompositeBuffers;
  /** When false, effect glyphs + glow are skipped (layer toggle). Default true. */
  showEffects?: boolean;
}

/** Converts base text into a per-cell code-point grid (spaces -> 0). */
export function textToCodes(baseText: string, cols: number, rows: number): Uint32Array {
  const codes = new Uint32Array(cols * rows);
  const lines = baseText.split("\n");
  for (let r = 0; r < rows; r++) {
    const line = lines[r] || "";
    for (let c = 0; c < cols && c < line.length; c++) {
      const code = line.codePointAt(c)!;
      codes[r * cols + c] = code === 0x20 ? 0 : code;
    }
  }
  return codes;
}

const U32_PER_INSTANCE = 3;

class InstanceArray {
  data = new Uint32Array(1024 * U32_PER_INSTANCE);
  count = 0;
  clear() { this.count = 0; }
  push(a: number, b: number, c: number) {
    const offset = this.count * U32_PER_INSTANCE;
    if (offset + U32_PER_INSTANCE > this.data.length) {
      const next = new Uint32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[offset] = a;
    this.data[offset + 1] = b;
    this.data[offset + 2] = c;
    this.count++;
  }
  view(): Uint32Array {
    return this.data.subarray(0, this.count * U32_PER_INSTANCE);
  }
}

interface ProgramBundle {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  uniforms: Record<string, WebGLUniformLocation | null>;
  instanceBuffer?: WebGLBuffer;
}

export class GlSceneRenderer {
  private readonly gl: WebGL2RenderingContext;
  private atlas: GlyphAtlas | null = null;
  private atlasFont: AtlasFont | null = null;
  private backdrop: { texture: WebGLTexture; width: number; height: number } | null = null;
  private backdropSource: ImageLike | null = null;
  private options: GlSceneOptions = { baseColor: 0xffdce6ff, baseAlpha: 0.38, blendMode: "screen" };
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private cornerBuffer!: WebGLBuffer;
  private backdropP!: ProgramBundle;
  private glyphP!: ProgramBundle;
  private glowP!: ProgramBundle;
  private baseInst = new InstanceArray();
  private fxInst = new InstanceArray();
  private glowInst = new InstanceArray();
  private contextLost = false;

  constructor(private readonly canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl as WebGL2RenderingContext;

    if ("addEventListener" in canvas) {
      canvas.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        this.contextLost = true;
      });
      canvas.addEventListener("webglcontextrestored", () => {
        this.contextLost = false;
        this.initGlObjects();
        if (this.atlasFont) this.setFont(this.atlasFont);
        if (this.backdropSource) this.setBackdrop(this.backdropSource);
      });
    }
    this.initGlObjects();
  }

  isContextLost(): boolean {
    return this.contextLost || this.gl.isContextLost();
  }

  private initGlObjects(): void {
    const { gl } = this;
    const cornerBuffer = gl.createBuffer();
    if (!cornerBuffer) throw new Error("gl: buffer alloc failed");
    this.cornerBuffer = cornerBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERT_CORNERS, gl.STATIC_DRAW);

    this.backdropP = this.makeBundle(BACKDROP_VERT, BACKDROP_FRAG,
      ["uUvRect", "uImage", "uCanvas", "uHasImage", "uBackdropMix", "uTint"], false);
    this.glyphP = this.makeBundle(GLYPH_VERT, GLYPH_FRAG,
      ["uCell", "uPad", "uCanvas", "uQuad", "uInkPad", "uSlotGrid", "uCellUv", "uAtlas"], true);
    this.glowP = this.makeBundle(GLOW_VERT, GLOW_FRAG,
      ["uCell", "uPad", "uCanvas"], true);
    this.atlas = null; // re-created lazily (textures died with the old context)
    this.backdrop = null;
  }

  private makeBundle(vert: string, frag: string, uniformNames: string[], instanced: boolean): ProgramBundle {
    const { gl } = this;
    const program = compileProgram(gl, vert, frag);
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("gl: vao alloc failed");
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    let instanceBuffer: WebGLBuffer | undefined;
    if (instanced) {
      instanceBuffer = gl.createBuffer() ?? undefined;
      if (!instanceBuffer) throw new Error("gl: buffer alloc failed");
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribIPointer(1, 3, gl.UNSIGNED_INT, 0, 0);
      gl.vertexAttribDivisor(1, 1);
    }
    gl.bindVertexArray(null);

    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const name of uniformNames) uniforms[name] = gl.getUniformLocation(program, name);
    return { program, vao, uniforms, instanceBuffer };
  }

  setViewport(cssW: number, cssH: number, dpr: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  setFont(font: AtlasFont): void {
    // Idempotent: configure() drops every rasterized glyph (a visible hitch),
    // so identical reconfigurations must be free.
    const prev = this.atlasFont;
    if (
      prev &&
      this.atlas &&
      prev.fontSize === font.fontSize &&
      prev.fontFamily === font.fontFamily &&
      prev.charW === font.charW &&
      prev.charH === font.charH &&
      prev.dpr === font.dpr
    ) {
      return;
    }
    this.atlasFont = font;
    if (!this.atlas) this.atlas = new GlyphAtlas(this.gl, font);
    else this.atlas.configure(font);
  }

  setBackdrop(source: ImageLike | null): void {
    const { gl } = this;
    if (source === this.backdropSource && (source === null) === (this.backdrop === null)) return;
    this.backdropSource = source;
    if (!source) {
      if (this.backdrop) gl.deleteTexture(this.backdrop.texture);
      this.backdrop = null;
      return;
    }
    const { width, height } = getImageSize(source);
    const texture = this.backdrop?.texture ?? gl.createTexture();
    if (!texture) throw new Error("gl: backdrop texture alloc failed");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.backdrop = { texture, width, height };
  }

  setSceneOptions(options: GlSceneOptions): void {
    this.options = options;
  }

  renderFrame(frame: GlFrame): void {
    if (this.isContextLost() || !this.atlas) return;
    const { gl, atlas } = this;
    const { grid, baseCodes, composite } = frame;
    const { cols, rows } = grid;
    const total = cols * rows;
    const { cellCodes, cellColors, asciiCodes, brightness, glowRadius } = composite;

    // --- Build instances from the composited SoA grid ---
    this.baseInst.clear();
    this.fxInst.clear();
    this.glowInst.clear();

    const baseRgba =
      ((Math.round(this.options.baseAlpha * 255) << 24) | (this.options.baseColor & 0xffffff)) >>> 0;

    this.currentGrid = grid;
    const showEffects = frame.showEffects ?? true;
    for (let i = 0; i < total; i++) {
      const row = (i / cols) | 0;
      const col = i % cols;
      const posPacked = (col | (row << 16)) >>> 0;

      // Base glyph (skip holes: applyToAscii winners replace the base char)
      if (baseCodes[i] !== 0 && (asciiCodes[i] === 0 || !showEffects)) {
        this.baseInst.push(posPacked, atlas.slotOf(baseCodes[i]), baseRgba);
      }

      // Effect cell (colored winners only — same as the 2D pipelines)
      const packed = cellColors[i];
      if (showEffects && packed !== 0) {
        const code = asciiCodes[i] > 0 ? asciiCodes[i] : cellCodes[i];
        if (code !== 0) {
          const b = brightness[i];
          const alpha = Math.min(1, b * 0.95);
          const rgba = ((Math.round(alpha * 255) << 24) | (packed & 0xffffff)) >>> 0;
          this.fxInst.push(posPacked, atlas.slotOf(code), rgba);

          const radius = glowRadius[i] >= 0 ? glowRadius[i] : 4 + 14 * b;
          if (radius > 0) {
            const radiusPx = Math.min(0xffff, Math.round(radius));
            const brightQ = Math.round(Math.min(1, b) * 255);
            this.glowInst.push(posPacked, (radiusPx | (brightQ << 16)) >>> 0, packed & 0xffffff);
          }
        }
      }
    }

    // --- Draw ---
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);

    this.drawBackdrop();

    const screenBlend = this.options.blendMode === "screen";
    gl.enable(gl.BLEND);

    // Base glyphs
    this.drawGlyphs(this.baseInst, screenBlend ? "screen" : "normal");
    // Glow under effect glyphs (normal premultiplied over)
    this.drawGlow();
    // Effect glyphs
    this.drawGlyphs(this.fxInst, "normal");

    gl.bindVertexArray(null);
  }

  private drawBackdrop(): void {
    const { gl } = this;
    const bundle = this.backdropP;
    gl.useProgram(bundle.program);
    gl.bindVertexArray(bundle.vao);
    gl.disable(gl.BLEND);

    if (this.backdrop) {
      // cover-crop uv window (matches drawImageCover)
      const imgAspect = this.backdrop.width / this.backdrop.height;
      const canvasAspect = this.cssW / this.cssH;
      let u0 = 0, v0 = 0, uw = 1, vh = 1;
      if (imgAspect > canvasAspect) {
        uw = canvasAspect / imgAspect;
        u0 = (1 - uw) / 2;
      } else {
        vh = imgAspect / canvasAspect;
        v0 = (1 - vh) / 2;
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.backdrop.texture);
      gl.uniform1i(bundle.uniforms.uImage, 0);
      gl.uniform4f(bundle.uniforms.uUvRect, u0, v0, uw, vh);
      gl.uniform1f(bundle.uniforms.uHasImage, 1);
    } else {
      gl.uniform1f(bundle.uniforms.uHasImage, 0);
    }
    gl.uniform1f(bundle.uniforms.uBackdropMix, this.options.backdropOpacity ?? 1);
    const tint = this.options.backdropTint ?? 0;
    gl.uniform3f(
      bundle.uniforms.uTint,
      ((tint >>> 16) & 0xff) / 255,
      ((tint >>> 8) & 0xff) / 255,
      (tint & 0xff) / 255,
    );
    gl.uniform2f(bundle.uniforms.uCanvas, this.cssW, this.cssH);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawGlyphs(instances: InstanceArray, blend: "screen" | "normal"): void {
    if (instances.count === 0 || !this.atlas || !this.atlasFont) return;
    const { gl, atlas } = this;
    const bundle = this.glyphP;
    gl.useProgram(bundle.program);
    gl.bindVertexArray(bundle.vao);

    if (blend === "screen") gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const grid = this.currentGrid!;
    const scale = atlas.rasterScale;
    gl.uniform2f(bundle.uniforms.uCell, grid.charW, grid.charH);
    gl.uniform2f(bundle.uniforms.uPad, grid.padX ?? 0, grid.padY ?? 0);
    gl.uniform2f(bundle.uniforms.uCanvas, this.cssW, this.cssH);
    gl.uniform2f(bundle.uniforms.uQuad, atlas.cellPxW / scale, atlas.cellPxH / scale);
    gl.uniform1f(bundle.uniforms.uInkPad, atlas.padPx / scale);
    gl.uniform2f(bundle.uniforms.uSlotGrid, atlas.slotCols, atlas.slotRows);
    const [cu, cv] = atlas.cellUv;
    gl.uniform2f(bundle.uniforms.uCellUv, cu, cv);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
    gl.uniform1i(bundle.uniforms.uAtlas, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, bundle.instanceBuffer!);
    gl.bufferData(gl.ARRAY_BUFFER, instances.view(), gl.STREAM_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instances.count);
  }

  private drawGlow(): void {
    if (this.glowInst.count === 0) return;
    const { gl } = this;
    const bundle = this.glowP;
    gl.useProgram(bundle.program);
    gl.bindVertexArray(bundle.vao);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const grid = this.currentGrid!;
    gl.uniform2f(bundle.uniforms.uCell, grid.charW, grid.charH);
    gl.uniform2f(bundle.uniforms.uPad, grid.padX ?? 0, grid.padY ?? 0);
    gl.uniform2f(bundle.uniforms.uCanvas, this.cssW, this.cssH);

    gl.bindBuffer(gl.ARRAY_BUFFER, bundle.instanceBuffer!);
    gl.bufferData(gl.ARRAY_BUFFER, this.glowInst.view(), gl.STREAM_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.glowInst.count);
  }

  private currentGrid: GridInfo | null = null;

  dispose(): void {
    const { gl } = this;
    this.atlas?.dispose();
    if (this.backdrop) gl.deleteTexture(this.backdrop.texture);
    for (const bundle of [this.backdropP, this.glyphP, this.glowP]) {
      gl.deleteProgram(bundle.program);
      gl.deleteVertexArray(bundle.vao);
      if (bundle.instanceBuffer) gl.deleteBuffer(bundle.instanceBuffer);
    }
    gl.deleteBuffer(this.cornerBuffer);
  }
}
