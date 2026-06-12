import type { AsciiEffect, GridInfo, MaskGrid, ControlDescriptor } from "./types";
import { type ColorMode, pickColorPacked, readColorsPacked, readColorMode, colorControls } from "./color-util";
import { type CellBuffer } from "../cell-buffer";

const DECODE_CHARS = "@#W$9876543210?!abc;:+=-,._";
const DECODE_CODES: number[] = [...DECODE_CHARS].map((c) => c.codePointAt(0)!);

function randomDecodeCode(): number {
  return DECODE_CODES[Math.floor(Math.random() * DECODE_CODES.length)];
}

export class DecodeEffect implements AsciiEffect {
  type = "decode";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private baseChars: string[][] = [];
  private delays: number[][] = [];
  private cellColorIdx: number[][] = [];
  private duration = 2.4;
  private settleTime = 0.4;
  private diagonalBias = 0.7;
  private colors: number[] = [];
  private colorMode: ColorMode = "random";

  init(grid: GridInfo, params: Record<string, unknown>): void {
    const newDuration = (params.duration as number) ?? 2.4;
    const newDiagonalBias = (params.diagonalBias as number) ?? 0.7;
    const needsRebuild = this.delays.length === 0
      || grid.cols !== this.grid.cols
      || grid.rows !== this.grid.rows
      || newDuration !== this.duration
      || newDiagonalBias !== this.diagonalBias;

    this.grid = grid;
    this.duration = newDuration;
    this.settleTime = (params.settleTime as number) ?? 0.4;
    this.diagonalBias = newDiagonalBias;
    this.colors = readColorsPacked(params, "#00ff41");
    this.colorMode = readColorMode(params);

    if (needsRebuild) this.buildDelays();
  }

  private buildDelays(): void {
    const { cols, rows } = this.grid;
    this.delays = [];
    this.cellColorIdx = [];
    let counter = 0;
    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      const colorRow: number[] = [];
      for (let c = 0; c < cols; c++) {
        const pos = (c / cols + r / rows) / 2;
        const delay = (pos * this.diagonalBias + Math.random() * (1 - this.diagonalBias)) * this.duration;
        row.push(delay);
        colorRow.push(this.colorMode === "random"
          ? Math.floor(Math.random() * this.colors.length)
          : counter);
        counter++;
      }
      this.delays.push(row);
      this.cellColorIdx.push(colorRow);
    }
  }

  setBaseText(text: string): void {
    this.baseChars = text.split("\n").map((line) => [...line]);
  }

  update(_dt: number, time: number, _mask: MaskGrid, out: CellBuffer): void {
    const { cols, rows } = this.grid;
    if (this.baseChars.length === 0) return;

    // Effect is done after duration + settleTime
    if (time > this.duration + this.settleTime + 0.5) return;

    for (let r = 0; r < rows && r < this.baseChars.length; r++) {
      const row = this.baseChars[r];
      for (let c = 0; c < cols && c < row.length; c++) {
        const delay = this.delays[r]?.[c] ?? 0;
        const elapsed = time - delay;
        const idx = this.cellColorIdx[r]?.[c] ?? 0;
        const color = pickColorPacked(this.colors, this.colorMode === "gradient" ? "random" : this.colorMode, idx);

        if (elapsed < 0) {
          // Not yet revealed — occasional random char
          if (Math.random() < 0.15) {
            out.push(r, c, randomDecodeCode(), 0.3, color);
          }
        } else if (elapsed < this.settleTime) {
          // Flickering between random and correct
          const progress = elapsed / this.settleTime;
          const correct = Math.random() < progress * 0.8;
          const chCode = correct ? row[c].codePointAt(0)! : randomDecodeCode();
          out.push(r, c, chCode, 0.5 + progress * 0.5, color);
        }
        // After settleTime: correct char locked in (handled by base ASCII layer)
      }
    }
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "duration", label: "Duration (s)", type: "slider", min: 0.5, max: 5, step: 0.1, defaultValue: 2.4 },
      { key: "settleTime", label: "Settle time (s)", type: "slider", min: 0.1, max: 1, step: 0.05, defaultValue: 0.4 },
      { key: "diagonalBias", label: "Diagonal bias", type: "slider", min: 0, max: 1, step: 0.05, defaultValue: 0.7 },
      ...colorControls("#00ff41"),
    ];
  }
}
