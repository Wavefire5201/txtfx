import type { AsciiEffect, GridInfo, MaskGrid, ControlDescriptor } from "./types";
import { type ColorMode, pickColorPacked, readColorsPacked, readColorMode, colorControls } from "./color-util";
import { type CellBuffer } from "../cell-buffer";
import { mulberry32, readSeed } from "../prng";

const SNOW_CHARS = ["*", "·", "."];
const SNOW_CODES: number[] = [...SNOW_CHARS].map((c) => c.codePointAt(0)!);

interface Flake {
  col: number;
  y: number;
  speed: number;
  drift: number;
  phase: number;
  code: number;
  color: number;
  baseBrightness: number;
}

export class SnowEffect implements AsciiEffect {
  type = "snow";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private flakes: Flake[] = [];
  private density = 0.15;
  private speedMin = 3;
  private speedMax = 8;
  private driftAmount = 2;
  private wind = 0;
  private spawnAccum = 0;
  private spawnCounter = 0;
  private colors: number[] = [];
  private colorMode: ColorMode = "random";
  private glowRadius = 12;
  private seed = 1;
  private rng: () => number = mulberry32(1);

  init(grid: GridInfo, params: Record<string, unknown>): void {
    const newSeed = readSeed(params);
    const needsRegen = this.grid.cols === 0
      || newSeed !== this.seed
      || grid.cols !== this.grid.cols
      || grid.rows !== this.grid.rows;

    this.density = (params.density as number) ?? 0.15;
    this.speedMin = (params.speedMin as number) ?? 3;
    this.speedMax = (params.speedMax as number) ?? 8;
    this.driftAmount = (params.driftAmount as number) ?? 2;
    this.wind = (params.wind as number) ?? 0;
    this.colors = readColorsPacked(params, "#ffffff");
    this.colorMode = readColorMode(params);
    this.glowRadius = (params.glowRadius as number) ?? 12;
    this.seed = newSeed;
    this.grid = grid;

    if (needsRegen) this.regen();
  }

  private regen(): void {
    this.rng = mulberry32(this.seed);
    this.flakes = [];
    this.spawnAccum = 0;
    this.spawnCounter = 0;
  }

  reset(): void {
    this.regen();
  }

  update(dt: number, time: number, _mask: MaskGrid, out: CellBuffer): void {
    const { cols, rows } = this.grid;

    this.spawnAccum += cols * this.density * dt;
    const spawnCount = Math.floor(this.spawnAccum);
    this.spawnAccum -= spawnCount;
    for (let i = 0; i < spawnCount; i++) {
      const idx = this.colorMode === "random"
        ? Math.floor(this.rng() * this.colors.length)
        : this.spawnCounter;
      this.flakes.push({
        col: this.rng() * cols,
        y: -1,
        speed: this.speedMin + this.rng() * (this.speedMax - this.speedMin),
        drift: this.driftAmount * (this.rng() - 0.5) * 2,
        phase: this.rng() * Math.PI * 2,
        code: SNOW_CODES[Math.floor(this.rng() * SNOW_CODES.length)],
        color: pickColorPacked(this.colors, this.colorMode === "gradient" ? "random" : this.colorMode, idx),
        baseBrightness: 0.55 + this.rng() * 0.35,
      });
      this.spawnCounter++;
    }

    for (let i = this.flakes.length - 1; i >= 0; i--) {
      const f = this.flakes[i];
      f.y += f.speed * dt;
      f.col += (Math.sin(time * 1.5 + f.phase) * f.drift + this.wind) * dt;

      if (f.y > rows || f.col < -2 || f.col > cols + 2) {
        this.flakes[i] = this.flakes[this.flakes.length - 1];
        this.flakes.pop();
        continue;
      }

      const r = Math.floor(f.y);
      const c = Math.round(f.col);
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        // Fade in over the first 2 rows so flakes don't pop into existence
        const fadeIn = r < 2 ? (r + 1) / 3 : 1;
        out.push(r, c, f.code, f.baseBrightness * fadeIn, f.color, this.glowRadius);
      }
    }
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "density", label: "Density", type: "slider", min: 0.02, max: 0.5, step: 0.02, defaultValue: 0.15 },
      { key: "speedMin", label: "Min speed", type: "slider", min: 1, max: 10, step: 0.5, defaultValue: 3 },
      { key: "speedMax", label: "Max speed", type: "slider", min: 3, max: 20, step: 0.5, defaultValue: 8 },
      { key: "driftAmount", label: "Drift", type: "slider", min: 0, max: 5, step: 0.5, defaultValue: 2 },
      { key: "wind", label: "Wind", type: "slider", min: -10, max: 10, step: 0.5, defaultValue: 0 },
      ...colorControls("#ffffff"),
      { key: "glowRadius", label: "Glow radius", type: "slider", min: 0, max: 40, step: 1, defaultValue: 12 },
    ];
  }
}
