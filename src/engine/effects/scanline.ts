import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";

export class ScanlineEffect implements AsciiEffect {
  type = "scanline";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private speed = 8;
  private width = 2;
  private brightness = 1;
  private count = 1;
  private color = "#88ccff";
  private glowRadius = 16;
  private chars = "=-~";
  private _cells: EffectCell[] = [];

  init(grid: GridInfo, params: Record<string, unknown>): void {
    this.grid = grid;
    this.speed = (params.speed as number) ?? 8;
    this.width = (params.width as number) ?? 2;
    this.brightness = (params.brightness as number) ?? 1;
    this.count = (params.count as number) ?? 1;
    this.color = (params.color as string) ?? "#88ccff";
    this.glowRadius = (params.glowRadius as number) ?? 16;
    this.chars = (params.chars as string) ?? "=-~";
  }

  update(_dt: number, time: number, _mask: MaskGrid): EffectCell[] {
    const { cols, rows } = this.grid;
    const cells = this._cells; cells.length = 0;

    for (let s = 0; s < this.count; s++) {
      // Each scanline is offset evenly across the grid height
      const phase = (s / this.count) * rows;
      const headRow = ((time * this.speed + phase) % (rows + this.width)) - this.width;

      for (let w = 0; w < this.width; w++) {
        const r = Math.floor(headRow + w);
        if (r < 0 || r >= rows) continue;

        // Brightness fades from head (brightest) to tail
        const t = w / this.width;
        const b = this.brightness * (1 - t * 0.6);
        const ch = this.chars[Math.min(w, this.chars.length - 1)] || "=";
        const gr = this.glowRadius * (1 - t * 0.5);

        for (let c = 0; c < cols; c++) {
          // Slight horizontal variation for visual interest
          const flicker = Math.sin(c * 0.5 + time * 12 + s * 3) * 0.15;
          const finalB = Math.max(0.1, b + flicker);
          cells.push({ row: r, col: c, char: ch, brightness: finalB, color: this.color, glowRadius: gr });
        }
      }
    }

    return cells;
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "speed", label: "Speed", type: "slider", min: 1, max: 20, step: 0.5, defaultValue: 8 },
      { key: "width", label: "Line width", type: "slider", min: 1, max: 8, step: 1, defaultValue: 2 },
      { key: "count", label: "Line count", type: "slider", min: 1, max: 5, step: 1, defaultValue: 1 },
      { key: "brightness", label: "Brightness", type: "slider", min: 0.2, max: 1, step: 0.05, defaultValue: 1 },
      { key: "color", label: "Color", type: "color", defaultValue: "#88ccff" },
      { key: "glowRadius", label: "Glow radius", type: "slider", min: 0, max: 40, step: 1, defaultValue: 16 },
    ];
  }
}
