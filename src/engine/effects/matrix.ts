import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";
import { type ColorMode, pickColor, readColors, readColorMode, colorControls } from "./color-util";

const MATRIX_CHARS = "0123456789abcdefABCDEF:.<>+*";

function randomChar(): string {
  return MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
}

interface Column {
  col: number;        // column position on grid
  speed: number;      // rows per second
  phase: number;      // current head position (fractional row)
  length: number;     // trail length in rows
  delay: number;      // seconds before respawn after completing
  waiting: number;    // current wait timer
  chars: string[];    // fixed char per row, occasionally cycled
  color: string;      // assigned color for this column
  colorIdx: number;
}

export class MatrixEffect implements AsciiEffect {
  type = "matrix";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private columns: Column[] = [];
  private density = 0.4;
  private speedMin = 5;
  private speedMax = 14;
  private colors: string[] = ["#00ff41"];
  private colorMode: ColorMode = "random";
  private glowRadius = 10;
  private spawnCounter = 0;
  private _cells: EffectCell[] = [];

  init(grid: GridInfo, params: Record<string, unknown>): void {
    const newDensity = (params.density as number) ?? 0.4;
    const needsRegen = this.grid.cols === 0
      || newDensity !== this.density
      || grid.cols !== this.grid.cols
      || grid.rows !== this.grid.rows;

    this.density = newDensity;
    this.speedMin = (params.speedMin as number) ?? 5;
    this.speedMax = (params.speedMax as number) ?? 14;
    this.colors = readColors(params, "#00ff41");
    this.colorMode = readColorMode(params);
    this.glowRadius = (params.glowRadius as number) ?? 10;
    this.grid = grid;

    if (needsRegen) {
      // Create one column entry per grid column, but only some are active
      const { cols, rows } = grid;
      this.columns = [];
      this.spawnCounter = 0;
      for (let c = 0; c < cols; c++) {
        if (Math.random() > this.density) continue;
        this.columns.push(this.makeColumn(rows, cols));
      }
    }
  }

  private makeColumn(rows: number, cols: number): Column {
    const idx = this.colorMode === "random"
      ? Math.floor(Math.random() * this.colors.length)
      : this.spawnCounter;
    const col: Column = {
      col: Math.floor(Math.random() * cols),
      speed: this.speedMin + Math.random() * (this.speedMax - this.speedMin),
      phase: -(Math.random() * rows), // start off-screen with random offset
      length: 8 + Math.floor(Math.random() * 14),
      delay: 0.5 + Math.random() * 3,
      waiting: 0,
      chars: Array.from({ length: rows }, randomChar),
      color: pickColor(this.colors, this.colorMode === "gradient" ? "random" : this.colorMode, idx),
      colorIdx: idx,
    };
    this.spawnCounter++;
    return col;
  }

  update(dt: number, _time: number, _mask: MaskGrid): EffectCell[] {
    const { cols, rows } = this.grid;
    const cells = this._cells; cells.length = 0;

    for (const col of this.columns) {
      // Waiting to respawn
      if (col.phase > rows + col.length) {
        col.waiting += dt;
        if (col.waiting >= col.delay) {
          col.phase = -col.length;
          col.waiting = 0;
          col.speed = this.speedMin + Math.random() * (this.speedMax - this.speedMin);
          col.length = 8 + Math.floor(Math.random() * 14);
          col.delay = 0.5 + Math.random() * 3;
          // Assign a new random column position
          col.col = Math.floor(Math.random() * cols);
          col.chars = Array.from({ length: rows }, randomChar);
          // Re-pick color on respawn
          const idx = this.colorMode === "random"
            ? Math.floor(Math.random() * this.colors.length)
            : this.spawnCounter;
          col.color = pickColor(this.colors, this.colorMode === "gradient" ? "random" : this.colorMode, idx);
          col.colorIdx = idx;
          this.spawnCounter++;
        }
        continue;
      }

      col.phase += col.speed * dt;
      const headRow = Math.floor(col.phase);

      const c = col.col;

      // Cycle a random char occasionally (skip when paused / dt=0)
      if (dt > 0 && Math.random() < 0.05) {
        const idx = Math.floor(Math.random() * col.chars.length);
        col.chars[idx] = randomChar();
      }

      // Render the trail
      for (let i = 0; i < col.length; i++) {
        const r = headRow - i;
        if (r < 0 || r >= rows) continue;

        const t = i / col.length; // 0 at head, 1 at tail
        let brightness: number;
        if (i === 0) {
          brightness = 1.0; // head is brightest
        } else if (i < 3) {
          brightness = 0.7;
        } else {
          brightness = Math.max(0.1, 0.5 * (1 - t));
        }

        // For gradient mode, gradient down the column trail
        const color = this.colorMode === "gradient"
          ? pickColor(this.colors, this.colorMode, col.colorIdx, t)
          : col.color;

        cells.push({ row: r, col: c, char: col.chars[r], brightness, color, glowRadius: this.glowRadius });
      }
    }

    return cells;
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "density", label: "Density", type: "slider", min: 0.1, max: 0.8, step: 0.05, defaultValue: 0.4 },
      { key: "speedMin", label: "Min speed", type: "slider", min: 2, max: 10, step: 1, defaultValue: 5 },
      { key: "speedMax", label: "Max speed", type: "slider", min: 5, max: 25, step: 1, defaultValue: 14 },
      ...colorControls("#00ff41"),
      { key: "glowRadius", label: "Glow radius", type: "slider", min: 0, max: 40, step: 1, defaultValue: 10 },
    ];
  }
}
