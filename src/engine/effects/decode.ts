import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";

const DECODE_CHARS = "@#W$9876543210?!abc;:+=-,._";

function randomDecodeChar(): string {
  return DECODE_CHARS[Math.floor(Math.random() * DECODE_CHARS.length)];
}

export class DecodeEffect implements AsciiEffect {
  type = "decode";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private baseChars: string[][] = [];
  private delays: number[][] = [];
  private duration = 2.4;
  private settleTime = 0.4;
  private diagonalBias = 0.7;
  private color = "#00ff41";
  private _cells: EffectCell[] = [];

  init(grid: GridInfo, params: Record<string, unknown>): void {
    this.grid = grid;
    this.duration = (params.duration as number) ?? 2.4;
    this.settleTime = (params.settleTime as number) ?? 0.4;
    this.diagonalBias = (params.diagonalBias as number) ?? 0.7;
    this.color = (params.color as string) ?? "#00ff41";
    this.buildDelays();
  }

  private buildDelays(): void {
    const { cols, rows } = this.grid;
    this.delays = [];
    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < cols; c++) {
        const pos = (c / cols + r / rows) / 2;
        const delay = (pos * this.diagonalBias + Math.random() * (1 - this.diagonalBias)) * this.duration;
        row.push(delay);
      }
      this.delays.push(row);
    }
  }

  setBaseText(text: string): void {
    this.baseChars = text.split("\n").map((line) => [...line]);
  }

  update(_dt: number, time: number, _mask: MaskGrid): EffectCell[] {
    const { cols, rows } = this.grid;
    if (this.baseChars.length === 0) return [];

    // Effect is done after duration + settleTime
    if (time > this.duration + this.settleTime + 0.5) return [];

    const cells = this._cells; cells.length = 0;

    for (let r = 0; r < rows && r < this.baseChars.length; r++) {
      const row = this.baseChars[r];
      for (let c = 0; c < cols && c < row.length; c++) {
        const delay = this.delays[r]?.[c] ?? 0;
        const elapsed = time - delay;

        if (elapsed < 0) {
          // Not yet revealed — occasional random char
          if (Math.random() < 0.15) {
            cells.push({ row: r, col: c, char: randomDecodeChar(), brightness: 0.3, color: this.color });
          }
        } else if (elapsed < this.settleTime) {
          // Flickering between random and correct
          const progress = elapsed / this.settleTime;
          const correct = Math.random() < progress * 0.8;
          const ch = correct ? row[c] : randomDecodeChar();
          cells.push({ row: r, col: c, char: ch, brightness: 0.5 + progress * 0.5, color: this.color });
        }
        // After settleTime: correct char locked in (handled by base ASCII layer)
      }
    }

    return cells;
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "duration", label: "Duration (s)", type: "slider", min: 0.5, max: 5, step: 0.1, defaultValue: 2.4 },
      { key: "settleTime", label: "Settle time (s)", type: "slider", min: 0.1, max: 1, step: 0.05, defaultValue: 0.4 },
      { key: "diagonalBias", label: "Diagonal bias", type: "slider", min: 0, max: 1, step: 0.05, defaultValue: 0.7 },
      { key: "color", label: "Color", type: "color", defaultValue: "#00ff41" },
    ];
  }
}
