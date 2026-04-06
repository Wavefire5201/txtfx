import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";

interface Star {
  c: number;
  r: number;
  phase: number;
  speed: number;
  big: boolean;
}

export class TwinkleEffect implements AsciiEffect {
  type = "twinkle";
  private stars: Star[] = [];
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private count = 50;
  private speedMin = 0.5;
  private speedMax = 2.3;
  private bigChance = 0.35;
  private color = "#ffffff";
  private glowRadius = 18;

  init(grid: GridInfo, params: Record<string, unknown>): void {
    this.grid = grid;
    this.count = (params.count as number) ?? 50;
    this.speedMin = (params.speedMin as number) ?? 0.5;
    this.speedMax = (params.speedMax as number) ?? 2.3;
    this.bigChance = (params.bigChance as number) ?? 0.35;
    this.color = (params.color as string) ?? "#ffffff";
    this.glowRadius = (params.glowRadius as number) ?? 18;

    this.stars = Array.from({ length: this.count }, () => ({
      c: Math.floor(Math.random() * grid.cols),
      r: Math.floor(Math.random() * grid.rows),
      phase: Math.random() * Math.PI * 2,
      speed: this.speedMin + Math.random() * (this.speedMax - this.speedMin),
      big: Math.random() < this.bigChance,
    }));
  }

  update(_dt: number, time: number, _mask: MaskGrid): EffectCell[] {
    const cells: EffectCell[] = [];
    for (const s of this.stars) {
      const pulse = 0.5 + 0.5 * Math.sin(time * s.speed + s.phase);
      if (pulse < 0.25) continue;
      const ch = pulse > 0.85 ? "*" : pulse > 0.6 ? "+" : "\u00B7";
      cells.push({ row: s.r, col: s.c, char: ch, brightness: pulse, color: this.color, glowRadius: this.glowRadius });
      if (s.big && pulse > 0.6) {
        cells.push({ row: s.r, col: s.c - 1, char: ".", brightness: pulse * 0.5, color: this.color, glowRadius: this.glowRadius * 0.6 });
        cells.push({ row: s.r, col: s.c + 1, char: ".", brightness: pulse * 0.5, color: this.color, glowRadius: this.glowRadius * 0.6 });
        if (pulse > 0.9) {
          cells.push({ row: s.r - 1, col: s.c, char: ".", brightness: pulse * 0.3, color: this.color, glowRadius: this.glowRadius * 0.4 });
        }
      }
    }
    return cells;
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "count", label: "Star count", type: "slider", min: 10, max: 200, step: 1, defaultValue: 50 },
      { key: "speedMin", label: "Min speed", type: "slider", min: 0.1, max: 2, step: 0.1, defaultValue: 0.5 },
      { key: "speedMax", label: "Max speed", type: "slider", min: 0.5, max: 5, step: 0.1, defaultValue: 2.3 },
      { key: "bigChance", label: "Big star %", type: "slider", min: 0, max: 1, step: 0.05, defaultValue: 0.35 },
      { key: "color", label: "Color", type: "color", defaultValue: "#ffffff" },
      { key: "glowRadius", label: "Glow radius", type: "slider", min: 0, max: 40, step: 1, defaultValue: 18 },
    ];
  }
}
