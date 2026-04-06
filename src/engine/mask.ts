import type { GridInfo, MaskGrid } from "./effects/types";

/**
 * Stores a grayscale mask at image resolution.
 * 0 = foreground, 255 = background.
 */
export class Mask {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height).fill(255); // default: all background
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
   */
  paintBrush(cx: number, cy: number, radius: number, value: number, feather = 0): void {
    const r = Math.ceil(radius + feather);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius + feather) continue;

        let strength = 1;
        if (feather > 0 && dist > radius) {
          strength = 1 - (dist - radius) / feather;
        }

        const px = cx + dx;
        const py = cy + dy;
        if (px < 0 || px >= this.width || py < 0 || py >= this.height) continue;

        const idx = py * this.width + px;
        const current = this.data[idx];
        const target = value;
        this.data[idx] = Math.round(current + (target - current) * strength);
      }
    }
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
}
