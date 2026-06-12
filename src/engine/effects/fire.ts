import type { AsciiEffect, GridInfo, MaskGrid, ControlDescriptor } from "./types";
import { type ColorMode, pickColorPacked, readColorsPacked, readColorMode, colorControls } from "./color-util";
import { type CellBuffer } from "../cell-buffer";

const FIRE_RAMP = ["@", "#", "*", "+", ".", " "];
const FIRE_RAMP_CODES: number[] = FIRE_RAMP.map((c) => c.codePointAt(0)!);
const CODE_SPACE = " ".codePointAt(0)!;

interface Ember {
  col: number;
  y: number;
  speed: number;
  life: number;
  maxLife: number;
  color: number;
  colorIdx: number;
}

export class FireEffect implements AsciiEffect {
  type = "fire";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private embers: Ember[] = [];
  private intensity = 0.5;
  private height = 0.3;
  private spread = 1.5;
  private flicker = 0;
  private spawnAccum = 0;
  private spawnCounter = 0;
  private colors: number[] = [];
  private colorMode: ColorMode = "random";
  private glowRadius = 16;

  init(grid: GridInfo, params: Record<string, unknown>): void {
    const needsRegen = this.grid.cols === 0
      || grid.cols !== this.grid.cols
      || grid.rows !== this.grid.rows;

    this.intensity = (params.intensity as number) ?? 0.5;
    this.height = (params.height as number) ?? 0.3;
    this.spread = (params.spread as number) ?? 1.5;
    this.flicker = (params.flicker as number) ?? 0;
    this.colors = readColorsPacked(params, "#ff6622");
    this.colorMode = readColorMode(params);
    this.glowRadius = (params.glowRadius as number) ?? 16;
    this.grid = grid;

    if (needsRegen) {
      this.embers = [];
      this.spawnAccum = 0;
      this.spawnCounter = 0;
    }
  }

  update(dt: number, time: number, _mask: MaskGrid, out: CellBuffer): void {
    const { cols, rows } = this.grid;
    const baseRow = rows - 1;

    // Spawn embers with fractional accumulation. Flicker modulates spawn rate
    // with two offset sines so fire "breathes" instead of being a flat column.
    const flickerMod = this.flicker > 0
      ? 1 + this.flicker * 0.5 * (Math.sin(time * 2.3) + Math.sin(time * 5.7 + 1.3) * 0.5)
      : 1;
    this.spawnAccum += cols * this.intensity * dt * 3 * Math.max(0, flickerMod);
    const spawnCount = Math.floor(this.spawnAccum);
    this.spawnAccum -= spawnCount;
    for (let i = 0; i < spawnCount; i++) {
      const idx = this.colorMode === "random"
        ? Math.floor(Math.random() * this.colors.length)
        : this.spawnCounter;
      this.embers.push({
        col: Math.random() * cols,
        y: baseRow + Math.random(),
        speed: 5 + Math.random() * 10,
        life: 0,
        maxLife: 0.5 + Math.random() * 1.5 * this.height,
        color: pickColorPacked(this.colors, this.colorMode === "gradient" ? "random" : this.colorMode, idx),
        colorIdx: idx,
      });
      this.spawnCounter++;
    }

    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.life += dt;
      e.y -= e.speed * dt;
      e.col += (Math.random() - 0.5) * this.spread * dt * 5;

      if (e.life > e.maxLife) {
        this.embers[i] = this.embers[this.embers.length - 1];
        this.embers.pop();
        continue;
      }

      const t = e.life / e.maxLife;
      const rampIdx = Math.min(Math.floor(t * (FIRE_RAMP_CODES.length - 1)), FIRE_RAMP_CODES.length - 1);
      const code = FIRE_RAMP_CODES[rampIdx];
      if (code === CODE_SPACE) continue;

      const r = Math.round(e.y);
      const c = Math.round(e.col);
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        // For gradient mode, use lifecycle position
        const color = this.colorMode === "gradient"
          ? pickColorPacked(this.colors, this.colorMode, e.colorIdx, t)
          : e.color;
        out.push(r, c, code, 1 - t, color, this.glowRadius);
      }
    }
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "intensity", label: "Intensity", type: "slider", min: 0.1, max: 1, step: 0.05, defaultValue: 0.5 },
      { key: "height", label: "Height", type: "slider", min: 0.1, max: 1, step: 0.05, defaultValue: 0.3 },
      { key: "spread", label: "Spread", type: "slider", min: 0, max: 5, step: 0.5, defaultValue: 1.5 },
      { key: "flicker", label: "Flicker", type: "slider", min: 0, max: 1, step: 0.05, defaultValue: 0 },
      ...colorControls("#ff6622"),
      { key: "glowRadius", label: "Glow radius", type: "slider", min: 0, max: 40, step: 1, defaultValue: 16 },
    ];
  }
}
