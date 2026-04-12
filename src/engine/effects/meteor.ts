import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";
import { type ColorMode, pickColor, readColors, readColorMode, colorControls } from "./color-util";

interface Trail {
  c: number;
  r: number;
  age: number;
}

interface MeteorState {
  c: number;
  r: number;
  age: number;
  maxAge: number;
  speed: number;
  trail: Trail[];
  color: string;
}

export class MeteorEffect implements AsciiEffect {
  type = "meteor";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private meteors: MeteorState[] = [];
  private nextSpawn = 1.0;
  private lastTime = 0;
  private dc = 0;
  private dr = 0;
  private spawnCounter = 0;

  private angle = -75;
  private intervalMin = 3;
  private intervalMax = 7;
  private speedMin = 22;
  private speedMax = 36;
  private trailLength = 25;
  private colors: string[] = ["#ffaa33"];
  private colorMode: ColorMode = "random";
  private glowRadius = 14;
  private _cells: EffectCell[] = [];

  init(grid: GridInfo, params: Record<string, unknown>): void {
    const needsRegen = this.grid.cols === 0
      || grid.cols !== this.grid.cols
      || grid.rows !== this.grid.rows;

    this.angle = (params.angle as number) ?? -75;
    this.intervalMin = (params.intervalMin as number) ?? 3;
    this.intervalMax = (params.intervalMax as number) ?? 7;
    this.speedMin = (params.speedMin as number) ?? 22;
    this.speedMax = (params.speedMax as number) ?? 36;
    this.trailLength = (params.trailLength as number) ?? 25;
    this.colors = readColors(params, "#ffaa33");
    this.colorMode = readColorMode(params);
    this.glowRadius = (params.glowRadius as number) ?? 14;
    this.dc = Math.cos((this.angle * Math.PI) / 180);
    this.dr = Math.sin((-this.angle * Math.PI) / 180);
    this.grid = grid;

    if (needsRegen) {
      this.meteors = [];
      this.nextSpawn = 1.0;
      this.spawnCounter = 0;
    }
  }

  update(dt: number, time: number, _mask: MaskGrid): EffectCell[] {
    const { cols, rows } = this.grid;
    const cells = this._cells; cells.length = 0;

    // Detect loop wrap: if time went backward, reset nextSpawn to new time + interval
    if (time < this.lastTime) {
      this.nextSpawn = time + Math.random() * (this.intervalMax - this.intervalMin);
    }
    this.lastTime = time;

    if (time > this.nextSpawn) {
      const idx = this.colorMode === "random"
        ? Math.floor(Math.random() * this.colors.length)
        : this.spawnCounter;
      this.meteors.push({
        c: Math.random() * cols * 1.1 - cols * 0.05,
        r: -2,
        age: 0,
        maxAge: 2.0 + Math.random() * 1.2,
        speed: this.speedMin + Math.random() * (this.speedMax - this.speedMin),
        trail: [],
        color: pickColor(this.colors, this.colorMode === "gradient" ? "random" : this.colorMode, idx),
      });
      this.spawnCounter++;
      this.nextSpawn = time + this.intervalMin + Math.random() * (this.intervalMax - this.intervalMin);
    }

    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      // Only advance state when time is actually moving (dt > 0).
      // With dt=0 (paused re-render), just emit cells from existing state.
      if (dt > 0) {
        m.age += dt;
        m.c += this.dc * m.speed * dt;
        m.r += this.dr * m.speed * dt;
        m.trail.push({ c: Math.round(m.c), r: Math.round(m.r), age: 0 });
        while (m.trail.length > this.trailLength) {
          m.trail.shift();
        }
        for (const p of m.trail) p.age += dt;
      }

      const offscreen = m.r > rows + 2 || m.c > cols + 2 || m.c < -2;
      if ((m.age > m.maxAge || offscreen) && m.trail.every((p) => p.age > 0.7)) {
        this.meteors[i] = this.meteors[this.meteors.length - 1];
        this.meteors.pop();
        continue;
      }

      for (let ti = 0; ti < m.trail.length; ti++) {
        const p = m.trail[ti];
        if (p.age > 0.7) continue;
        const ch = p.age < 0.12 ? "*" : p.age < 0.35 ? "+" : ".";
        const brightness = 1 - p.age / 0.7;
        // For gradient mode, gradient along trail length
        const color = this.colorMode === "gradient"
          ? pickColor(this.colors, this.colorMode, 0, ti / m.trail.length)
          : m.color;
        if (p.r >= 0 && p.r < rows && p.c >= 0 && p.c < cols) {
          cells.push({ row: p.r, col: p.c, char: ch, brightness, color, glowRadius: this.glowRadius });
        }
      }
      if (m.age < m.maxAge && !offscreen) {
        const mr = Math.round(m.r), mc = Math.round(m.c);
        if (mr >= 0 && mr < rows && mc >= 0 && mc < cols) {
          cells.push({ row: mr, col: mc, char: "@", brightness: 1, color: m.color, glowRadius: this.glowRadius });
        }
      }
    }

    return cells;
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "angle", label: "Angle", type: "slider", min: -180, max: 0, step: 5, defaultValue: -75 },
      { key: "intervalMin", label: "Min interval (s)", type: "slider", min: 0.5, max: 10, step: 0.5, defaultValue: 3 },
      { key: "intervalMax", label: "Max interval (s)", type: "slider", min: 1, max: 20, step: 0.5, defaultValue: 7 },
      { key: "trailLength", label: "Trail length", type: "slider", min: 5, max: 50, step: 1, defaultValue: 25 },
      ...colorControls("#ffaa33"),
      { key: "glowRadius", label: "Glow radius", type: "slider", min: 0, max: 40, step: 1, defaultValue: 14 },
    ];
  }
}
