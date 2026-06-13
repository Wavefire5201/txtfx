import type { GridInfo, MaskGrid } from "./effects/types";

/** Inclusive pixel rect in mask/image coordinates. */
export interface MaskDirtyRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Stores a grayscale mask at image resolution.
 * 0 = foreground, 255 = background.
 */
export class Mask {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number, data?: Uint8Array) {
    this.width = width;
    this.height = height;
    if (data && data.length === width * height) {
      this.data = data;
    } else {
      this.data = new Uint8Array(width * height).fill(255); // default: all background
    }
  }

  get(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 255;
    return this.data[y * this.width + x];
  }

  set(x: number, y: number, value: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.data[y * this.width + x] = value;
  }

  clear(value = 255): void {
    this.data.fill(value);
  }

  invert(): void {
    for (let i = 0; i < this.data.length; i++) {
      this.data[i] = 255 - this.data[i];
    }
  }

  /**
   * Paint a circular brush stroke onto the mask.
   * value: 0 for foreground, 255 for background.
   * Returns the touched pixel rect (clamped), or null if fully outside.
   */
  paintBrush(cx: number, cy: number, radius: number, value: number, feather = 0, radiusY?: number): MaskDirtyRect | null {
    const ry = radiusY ?? radius;
    const rx = radius;
    const extX = Math.ceil(rx + feather);
    const extY = Math.ceil(ry + feather);
    for (let dy = -extY; dy <= extY; dy++) {
      for (let dx = -extX; dx <= extX; dx++) {
        // Normalized distance: 1.0 at the ellipse edge
        const nx = rx > 0 ? dx / rx : 0;
        const ny = ry > 0 ? dy / ry : 0;
        const normDist = Math.sqrt(nx * nx + ny * ny);
        if (normDist > 1 + (feather / Math.max(rx, ry))) continue;

        let strength = 1;
        if (feather > 0 && normDist > 1) {
          strength = 1 - (normDist - 1) / (feather / Math.max(rx, ry));
        }

        const px = cx + dx;
        const py = cy + dy;
        if (px < 0 || px >= this.width || py < 0 || py >= this.height) continue;

        const idx = py * this.width + px;
        const current = this.data[idx];
        this.data[idx] = Math.round(current + (value - current) * strength);
      }
    }

    const x0 = Math.max(0, cx - extX);
    const y0 = Math.max(0, cy - extY);
    const x1 = Math.min(this.width - 1, cx + extX);
    const y1 = Math.min(this.height - 1, cy + extY);
    if (x0 > x1 || y0 > y1) return null;
    return { x0, y0, x1, y1 };
  }

  /**
   * Downsamples the mask to the ASCII grid dimensions.
   * Returns a MaskGrid that effects can query per-cell.
   */
  toGrid(grid: GridInfo, imageWidth: number, imageHeight: number): MaskGrid {
    const { cols, rows } = grid;
    const cellW = imageWidth / cols;
    const cellH = imageHeight / rows;
    const values = new Float32Array(cols * rows);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = Math.floor(c * cellW);
        const y0 = Math.floor(r * cellH);
        const x1 = Math.min(Math.floor((c + 1) * cellW), this.width);
        const y1 = Math.min(Math.floor((r + 1) * cellH), this.height);
        let sum = 0;
        let count = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            sum += this.data[y * this.width + x];
            count++;
          }
        }
        values[r * cols + c] = count > 0 ? sum / count / 255 : 1;
      }
    }

    return {
      get(row: number, col: number): number {
        if (row < 0 || row >= rows || col < 0 || col >= cols) return 1;
        return values[row * cols + col];
      },
    };
  }

  /**
   * Grid-resolution view of the mask that supports incremental updates.
   * Full toGrid() recomputation is O(image pixels) — far too slow to run per
   * pointermove while painting. updateRect() recomputes ONLY the grid cells
   * intersecting a brush stroke's dirty rect, using the same per-cell math,
   * so results are exactly equal to a fresh toGrid().
   */
  createIncrementalGrid(grid: GridInfo, imageWidth: number, imageHeight: number): IncrementalMaskGrid {
    return new IncrementalMaskGrid(this, grid, imageWidth, imageHeight);
  }

  /** Encode mask as a base64 grayscale PNG. */
  toBase64(): string {
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext("2d")!;
    const imgData = ctx.createImageData(this.width, this.height);
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i];
      imgData.data[i * 4] = v;
      imgData.data[i * 4 + 1] = v;
      imgData.data[i * 4 + 2] = v;
      imgData.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL("image/png");
  }

  /** Load mask from a base64 grayscale PNG. */
  static fromBase64(dataUrl: string, width: number, height: number): Promise<Mask> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        const d = ctx.getImageData(0, 0, width, height).data;
        const mask = new Mask(width, height);
        for (let i = 0; i < mask.data.length; i++) {
          mask.data[i] = d[i * 4]; // red channel
        }
        resolve(mask);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  /** Load a mask from a base64 grayscale PNG, inferring width/height from the
   * decoded image (shared scenes don't carry mask dimensions separately). */
  static fromBase64Auto(dataUrl: string): Promise<Mask> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, w, h).data;
        const mask = new Mask(w, h);
        for (let i = 0; i < mask.data.length; i++) mask.data[i] = d[i * 4];
        resolve(mask);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }
}

export class IncrementalMaskGrid implements MaskGrid {
  private readonly values: Float32Array;
  private readonly cols: number;
  private readonly rows: number;
  private readonly cellW: number;
  private readonly cellH: number;

  constructor(
    private readonly mask: Mask,
    grid: GridInfo,
    imageWidth: number,
    imageHeight: number,
  ) {
    this.cols = grid.cols;
    this.rows = grid.rows;
    this.cellW = imageWidth / grid.cols;
    this.cellH = imageHeight / grid.rows;
    this.values = new Float32Array(this.cols * this.rows);
    this.rebuildAll();
  }

  get(row: number, col: number): number {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return 1;
    return this.values[row * this.cols + col];
  }

  rebuildAll(): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.recomputeCell(r, c);
      }
    }
  }

  /** Recomputes only the grid cells intersecting the dirty pixel rect. */
  updateRect(rect: MaskDirtyRect): void {
    const c0 = Math.max(0, Math.floor(rect.x0 / this.cellW));
    const c1 = Math.min(this.cols - 1, Math.floor(rect.x1 / this.cellW));
    const r0 = Math.max(0, Math.floor(rect.y0 / this.cellH));
    const r1 = Math.min(this.rows - 1, Math.floor(rect.y1 / this.cellH));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        this.recomputeCell(r, c);
      }
    }
  }

  /** Identical math to Mask.toGrid for one cell — keeps both paths exactly equal. */
  private recomputeCell(r: number, c: number): void {
    const x0 = Math.floor(c * this.cellW);
    const y0 = Math.floor(r * this.cellH);
    const x1 = Math.min(Math.floor((c + 1) * this.cellW), this.mask.width);
    const y1 = Math.min(Math.floor((r + 1) * this.cellH), this.mask.height);
    let sum = 0;
    let count = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        sum += this.mask.data[y * this.mask.width + x];
        count++;
      }
    }
    this.values[r * this.cols + c] = count > 0 ? sum / count / 255 : 1;
  }
}
