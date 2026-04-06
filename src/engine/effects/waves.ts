import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";

export class WavesEffect implements AsciiEffect {
  type = "waves";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private amplitude = 2;
  private frequency = 0.3;
  private speed = 2;
  private baseChars: string[][] = [];

  init(grid: GridInfo, params: Record<string, unknown>): void {
    this.grid = grid;
    this.amplitude = (params.amplitude as number) ?? 2;
    this.frequency = (params.frequency as number) ?? 0.3;
    this.speed = (params.speed as number) ?? 2;
  }

  /** Must be called after ASCII text is generated, to capture the base grid. */
  setBaseText(text: string): void {
    this.baseChars = text.split("\n").map((line) => [...line]);
  }

  update(_dt: number, time: number, _mask: MaskGrid): EffectCell[] {
    const { cols, rows } = this.grid;
    if (this.baseChars.length === 0) return [];

    const cells: EffectCell[] = [];

    for (let r = 0; r < rows && r < this.baseChars.length; r++) {
      const row = this.baseChars[r];
      for (let c = 0; c < cols && c < row.length; c++) {
        const offset = Math.round(
          Math.sin(r * this.frequency + time * this.speed) * this.amplitude
        );
        const srcCol = c - offset;
        if (srcCol < 0 || srcCol >= row.length) continue;
        const ch = row[srcCol];
        if (ch === " ") continue;
        if (offset !== 0) {
          cells.push({ row: r, col: c, char: ch, brightness: 0.5 });
        }
      }
    }

    return cells;
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "amplitude", label: "Amplitude", type: "slider", min: 0.5, max: 8, step: 0.5, defaultValue: 2 },
      { key: "frequency", label: "Frequency", type: "slider", min: 0.05, max: 1, step: 0.05, defaultValue: 0.3 },
      { key: "speed", label: "Speed", type: "slider", min: 0.5, max: 5, step: 0.5, defaultValue: 2 },
    ];
  }
}
