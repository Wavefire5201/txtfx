import type { AsciiEffect, GridInfo, MaskGrid, ControlDescriptor } from "./types";
import { type ColorMode, pickColorPacked, readColorsPacked, readColorMode, colorControls } from "./color-util";
import { type CellBuffer } from "../cell-buffer";
import { mulberry32, readSeed } from "../prng";

const GLITCH_CHARS = "@#$%&*!?/\\|[]{}()<>~^";
const GLITCH_CODES: number[] = [...GLITCH_CHARS].map((c) => c.codePointAt(0)!);

interface GlitchBlock {
  col: number;
  row: number;
  w: number;
  h: number;
  life: number;
  maxLife: number;
  color: number;
}

export class GlitchEffect implements AsciiEffect {
  type = "glitch";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private blocks: GlitchBlock[] = [];
  private nextSpawn = 0;
  private lastTime = 0;
  private spawnCounter = 0;
  private frequency = 0.5;
  private blockSize = 8;
  private density = 0.6;
  private colors: number[] = [];
  private colorMode: ColorMode = "random";
  private glowRadius = 0;
  private seed = 1;
  private rng: () => number = mulberry32(1);

  init(grid: GridInfo, params: Record<string, unknown>): void {
    const newSeed = readSeed(params);
    const needsRegen = this.grid.cols === 0
      || newSeed !== this.seed
      || grid.cols !== this.grid.cols
      || grid.rows !== this.grid.rows;

    this.grid = grid;
    this.seed = newSeed;
    this.frequency = (params.frequency as number) ?? 0.5;
    this.blockSize = (params.blockSize as number) ?? 8;
    // Legacy `intensity` is supported as a fallback so older saved scenes keep working
    this.density = (params.density as number) ?? (params.intensity as number) ?? 0.6;
    this.colors = readColorsPacked(params, "#ff3366");
    this.colorMode = readColorMode(params);
    this.glowRadius = (params.glowRadius as number) ?? 0;

    if (needsRegen) this.regen();
  }

  private regen(): void {
    this.rng = mulberry32(this.seed);
    this.blocks = [];
    this.nextSpawn = 0;
    this.lastTime = 0;
    this.spawnCounter = 0;
  }

  reset(): void {
    this.regen();
  }

  update(dt: number, time: number, _mask: MaskGrid, out: CellBuffer): void {
    const { cols, rows } = this.grid;

    // Detect loop wrap: if time went backward, reset nextSpawn to the new time
    if (time < this.lastTime) {
      this.nextSpawn = time;
    }
    this.lastTime = time;

    if (time > this.nextSpawn) {
      const w = 2 + Math.floor(this.rng() * this.blockSize);
      const h = 1 + Math.floor(this.rng() * Math.max(1, this.blockSize / 3));
      const idx = this.colorMode === "random"
        ? Math.floor(this.rng() * this.colors.length)
        : this.spawnCounter;
      this.blocks.push({
        col: Math.floor(this.rng() * Math.max(1, cols - w)),
        row: Math.floor(this.rng() * Math.max(1, rows - h)),
        w,
        h,
        life: 0,
        maxLife: 0.05 + this.rng() * 0.2,
        color: pickColorPacked(this.colors, this.colorMode === "gradient" ? "random" : this.colorMode, idx),
      });
      this.spawnCounter++;
      this.nextSpawn = time + (1 / this.frequency) * (0.5 + this.rng());
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
          if (this.rng() > this.density) continue;
          const chCode = GLITCH_CODES[Math.floor(this.rng() * GLITCH_CODES.length)];
          out.push(r, c, chCode, 0.8 + this.rng() * 0.2, b.color, this.glowRadius);
        }
      }
    }
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "frequency", label: "Frequency (hz)", type: "slider", min: 0.1, max: 5, step: 0.1, defaultValue: 0.5 },
      { key: "blockSize", label: "Block size", type: "slider", min: 2, max: 20, step: 1, defaultValue: 8 },
      { key: "density", label: "Density", type: "slider", min: 0.1, max: 1, step: 0.05, defaultValue: 0.6 },
      ...colorControls("#ff3366"),
      { key: "glowRadius", label: "Glow radius", type: "slider", min: 0, max: 40, step: 1, defaultValue: 0 },
    ];
  }
}
