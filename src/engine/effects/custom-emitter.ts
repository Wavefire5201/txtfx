import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";

interface Particle {
  c: number;
  r: number;
  vc: number;
  vr: number;
  life: number;
  maxLife: number;
  charIdx: number;
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

  init(grid: GridInfo, params: Record<string, unknown>): void {
    this.grid = grid;
    this.chars = (params.chars as string) ?? "*+.";
    this.spawnRate = (params.spawnRate as number) ?? 10;
    this.direction = (params.direction as number) ?? -90;
    this.spread = (params.spread as number) ?? 30;
    this.speed = (params.speed as number) ?? 10;
    this.gravity = (params.gravity as number) ?? 0;
    this.lifetime = (params.lifetime as number) ?? 2;
    this.spawnX = (params.spawnX as number) ?? 0.5;
    this.spawnY = (params.spawnY as number) ?? 1.0;
    this.particles = [];
    this.spawnAccum = 0;
  }

  update(dt: number, _time: number, _mask: MaskGrid): EffectCell[] {
    const { cols, rows } = this.grid;
    const cells: EffectCell[] = [];

    // Spawn with fractional accumulation
    this.spawnAccum += this.spawnRate * dt;
    const count = Math.floor(this.spawnAccum);
    this.spawnAccum -= count;
    for (let i = 0; i < count; i++) {
      const angle = ((this.direction + (Math.random() - 0.5) * this.spread) * Math.PI) / 180;
      const spd = this.speed * (0.7 + Math.random() * 0.6);
      this.particles.push({
        c: this.spawnX * cols,
        r: this.spawnY * rows,
        vc: Math.cos(angle) * spd,
        vr: Math.sin(angle) * spd,
        life: 0,
        maxLife: this.lifetime * (0.5 + Math.random()),
        charIdx: Math.floor(Math.random() * this.chars.length),
      });
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life > p.maxLife) {
        this.particles.splice(i, 1);
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
        cells.push({
          row: r,
          col: c,
          char: this.chars[charProgress],
          brightness: 1 - t,
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
    ];
  }
}
