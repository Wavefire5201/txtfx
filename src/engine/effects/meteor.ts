import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";

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
}

export class MeteorEffect implements AsciiEffect {
  type = "meteor";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private meteors: MeteorState[] = [];
  private nextSpawn = 1.0;
  private dc = 0;
  private dr = 0;

  private angle = -75;
  private intervalMin = 3;
  private intervalMax = 7;
  private speedMin = 22;
  private speedMax = 36;
  private trailLength = 25;

  init(grid: GridInfo, params: Record<string, unknown>): void {
    this.grid = grid;
    this.angle = (params.angle as number) ?? -75;
    this.intervalMin = (params.intervalMin as number) ?? 3;
    this.intervalMax = (params.intervalMax as number) ?? 7;
    this.speedMin = (params.speedMin as number) ?? 22;
    this.speedMax = (params.speedMax as number) ?? 36;
    this.trailLength = (params.trailLength as number) ?? 25;

    this.dc = Math.cos((this.angle * Math.PI) / 180);
    this.dr = Math.sin((-this.angle * Math.PI) / 180);
    this.meteors = [];
    this.nextSpawn = 1.0;
  }

  update(dt: number, time: number, _mask: MaskGrid): EffectCell[] {
    const { cols, rows } = this.grid;
    const cells: EffectCell[] = [];

    if (time > this.nextSpawn) {
      this.meteors.push({
        c: Math.random() * cols * 1.1 - cols * 0.05,
        r: -2,
        age: 0,
        maxAge: 2.0 + Math.random() * 1.2,
        speed: this.speedMin + Math.random() * (this.speedMax - this.speedMin),
        trail: [],
      });
      this.nextSpawn = time + this.intervalMin + Math.random() * (this.intervalMax - this.intervalMin);
    }

    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.age += dt;
      m.c += this.dc * m.speed * dt;
      m.r += this.dr * m.speed * dt;

      m.trail.push({ c: Math.round(m.c), r: Math.round(m.r), age: 0 });
      if (m.trail.length > this.trailLength) m.trail.shift();
      for (const p of m.trail) p.age += dt;

      const offscreen = m.r > rows + 2 || m.c > cols + 2 || m.c < -2;
      if ((m.age > m.maxAge || offscreen) && m.trail.every((p) => p.age > 0.7)) {
        this.meteors.splice(i, 1);
        continue;
      }

      for (const p of m.trail) {
        if (p.age > 0.7) continue;
        const ch = p.age < 0.12 ? "*" : p.age < 0.35 ? "+" : ".";
        const brightness = 1 - p.age / 0.7;
        cells.push({ row: p.r, col: p.c, char: ch, brightness });
      }
      if (m.age < m.maxAge && !offscreen) {
        cells.push({ row: Math.round(m.r), col: Math.round(m.c), char: "@", brightness: 1 });
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
    ];
  }
}
