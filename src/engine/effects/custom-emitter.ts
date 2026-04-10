import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";
import { type ColorMode, pickColor, readColors, readColorMode, colorControls } from "./color-util";

interface Particle {
  c: number;
  r: number;
  vc: number;
  vr: number;
  life: number;
  maxLife: number;
  charIdx: number;
  color: string;
  colorIdx: number;
}

export class CustomEmitterEffect implements AsciiEffect {
  type = "custom-emitter";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private particles: Particle[] = [];

  private chars = "*+.";
  private spawnRate = 10;
  private direction = -90; // degrees, -90 = up
  private spread = 30;
  private speed = 10;
  private gravity = 0;
  private lifetime = 2;
  private spawnX = 0.5; // 0-1 normalized
  private spawnY = 1.0;
  private spawnAccum = 0;
  private spawnCounter = 0;
  private colors: string[] = ["#ffffff"];
  private colorMode: ColorMode = "random";
  private glowRadius = 14;
  private _cells: EffectCell[] = [];

  init(grid: GridInfo, params: Record<string, unknown>): void {
    const newSpawnX = (params.spawnX as number) ?? 0.5;
    const newSpawnY = (params.spawnY as number) ?? 1.0;
    const needsRegen = this.particles.length === 0
      || grid.cols !== this.grid.cols
      || grid.rows !== this.grid.rows
      || newSpawnX !== this.spawnX
      || newSpawnY !== this.spawnY;

    this.grid = grid;
    this.chars = (params.chars as string) ?? "*+.";
    this.spawnRate = (params.spawnRate as number) ?? 10;
    this.direction = (params.direction as number) ?? -90;
    this.spread = (params.spread as number) ?? 30;
    this.speed = (params.speed as number) ?? 10;
    this.gravity = (params.gravity as number) ?? 0;
    this.lifetime = (params.lifetime as number) ?? 2;
    this.spawnX = newSpawnX;
    this.spawnY = newSpawnY;
    this.colors = readColors(params, "#ffffff");
    this.colorMode = readColorMode(params);
    this.glowRadius = (params.glowRadius as number) ?? 14;

    if (needsRegen) {
      this.particles = [];
      this.spawnAccum = 0;
      this.spawnCounter = 0;
    }
  }

  update(dt: number, _time: number, _mask: MaskGrid): EffectCell[] {
    const { cols, rows } = this.grid;
    const cells = this._cells; cells.length = 0;

    // Spawn with fractional accumulation
    this.spawnAccum += this.spawnRate * dt;
    const count = Math.floor(this.spawnAccum);
    this.spawnAccum -= count;
    for (let i = 0; i < count; i++) {
      const angle = ((this.direction + (Math.random() - 0.5) * this.spread) * Math.PI) / 180;
      const spd = this.speed * (0.7 + Math.random() * 0.6);
      const idx = this.colorMode === "random"
        ? Math.floor(Math.random() * this.colors.length)
        : this.spawnCounter;
      this.particles.push({
        c: this.spawnX * cols,
        r: this.spawnY * rows,
        vc: Math.cos(angle) * spd,
        vr: Math.sin(angle) * spd,
        life: 0,
        maxLife: this.lifetime * (0.5 + Math.random()),
        charIdx: Math.floor(Math.random() * this.chars.length),
        color: pickColor(this.colors, this.colorMode === "gradient" ? "random" : this.colorMode, idx),
        colorIdx: idx,
      });
      this.spawnCounter++;
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life > p.maxLife) {
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        continue;
      }

      p.c += p.vc * dt;
      p.vr += this.gravity * dt;
      p.r += p.vr * dt;

      const r = Math.round(p.r);
      const c = Math.round(p.c);
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        const t = p.life / p.maxLife;
        const charProgress = Math.min(Math.floor(t * this.chars.length), this.chars.length - 1);
        // For gradient mode, use lifecycle position
        const color = this.colorMode === "gradient"
          ? pickColor(this.colors, this.colorMode, p.colorIdx, t)
          : p.color;
        cells.push({
          row: r,
          col: c,
          char: this.chars[charProgress],
          brightness: 1 - t,
          color,
          glowRadius: this.glowRadius,
        });
      }
    }

    return cells;
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "chars", label: "Characters", type: "text", defaultValue: "*+." },
      { key: "spawnRate", label: "Spawn rate (/s)", type: "slider", min: 1, max: 100, step: 1, defaultValue: 10 },
      { key: "direction", label: "Direction", type: "slider", min: -180, max: 180, step: 5, defaultValue: -90 },
      { key: "spread", label: "Spread", type: "slider", min: 0, max: 180, step: 5, defaultValue: 30 },
      { key: "speed", label: "Speed", type: "slider", min: 1, max: 50, step: 1, defaultValue: 10 },
      { key: "gravity", label: "Gravity", type: "slider", min: -20, max: 20, step: 1, defaultValue: 0 },
      { key: "lifetime", label: "Lifetime (s)", type: "slider", min: 0.2, max: 5, step: 0.1, defaultValue: 2 },
      { key: "spawnX", label: "Spawn X", type: "slider", min: 0, max: 1, step: 0.05, defaultValue: 0.5 },
      { key: "spawnY", label: "Spawn Y", type: "slider", min: 0, max: 1, step: 0.05, defaultValue: 1 },
      ...colorControls("#ffffff"),
      { key: "glowRadius", label: "Glow radius", type: "slider", min: 0, max: 40, step: 1, defaultValue: 14 },
    ];
  }
}
