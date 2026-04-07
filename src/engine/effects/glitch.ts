import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";

const GLITCH_CHARS = "@#$%&*!?/\\|[]{}()<>~^";

interface GlitchBlock {
  col: number;
  row: number;
  w: number;
  h: number;
  life: number;
  maxLife: number;
}

export class GlitchEffect implements AsciiEffect {
  type = "glitch";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private blocks: GlitchBlock[] = [];
  private nextSpawn = 0;
  private frequency = 0.5;
  private blockSize = 8;
  private intensity = 0.6;
  private color = "#ff3366";
  private _cells: EffectCell[] = [];

  init(grid: GridInfo, params: Record<string, unknown>): void {
    this.grid = grid;
    this.frequency = (params.frequency as number) ?? 0.5;
    this.blockSize = (params.blockSize as number) ?? 8;
    this.intensity = (params.intensity as number) ?? 0.6;
    this.color = (params.color as string) ?? "#ff3366";
    this.blocks = [];
    this.nextSpawn = 0;
  }

  update(dt: number, time: number, _mask: MaskGrid): EffectCell[] {
    const { cols, rows } = this.grid;
    const cells = this._cells; cells.length = 0;

    if (time > this.nextSpawn) {
      const w = 2 + Math.floor(Math.random() * this.blockSize);
      const h = 1 + Math.floor(Math.random() * Math.max(1, this.blockSize / 3));
      this.blocks.push({
        col: Math.floor(Math.random() * Math.max(1, cols - w)),
        row: Math.floor(Math.random() * Math.max(1, rows - h)),
        w,
        h,
        life: 0,
        maxLife: 0.05 + Math.random() * 0.2,
      });
      this.nextSpawn = time + (1 / this.frequency) * (0.5 + Math.random());
    }

    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      b.life += dt;
      if (b.life > b.maxLife) {
        this.blocks[i] = this.blocks[this.blocks.length - 1];
        this.blocks.pop();
        continue;
      }

      for (let r = b.row; r < b.row + b.h && r < rows; r++) {
        for (let c = b.col; c < b.col + b.w && c < cols; c++) {
          if (Math.random() > this.intensity) continue;
          const ch = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
          cells.push({ row: r, col: c, char: ch, brightness: 0.8 + Math.random() * 0.2, color: this.color });
        }
      }
    }

    return cells;
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "frequency", label: "Frequency (hz)", type: "slider", min: 0.1, max: 5, step: 0.1, defaultValue: 0.5 },
      { key: "blockSize", label: "Block size", type: "slider", min: 2, max: 20, step: 1, defaultValue: 8 },
      { key: "intensity", label: "Intensity", type: "slider", min: 0.1, max: 1, step: 0.05, defaultValue: 0.6 },
      { key: "color", label: "Color", type: "color", defaultValue: "#ff3366" },
    ];
  }
}
