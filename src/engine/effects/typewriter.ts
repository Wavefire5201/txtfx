import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";

export class TypewriterEffect implements AsciiEffect {
  type = "typewriter";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private baseChars: string[][] = [];
  private speed = 200; // chars per second
  private cursor = "_";
  private color = "#ffffff";

  init(grid: GridInfo, params: Record<string, unknown>): void {
    this.grid = grid;
    this.speed = (params.speed as number) ?? 200;
    this.cursor = (params.cursor as string) ?? "_";
    this.color = (params.color as string) ?? "#ffffff";
  }

  setBaseText(text: string): void {
    this.baseChars = text.split("\n").map((line) => [...line]);
  }

  update(_dt: number, time: number, _mask: MaskGrid): EffectCell[] {
    const { cols, rows } = this.grid;
    if (this.baseChars.length === 0) return [];

    const totalChars = cols * rows;
    const revealed = Math.min(Math.floor(time * this.speed), totalChars);
    const cells: EffectCell[] = [];

    let count = 0;
    for (let r = 0; r < rows && r < this.baseChars.length; r++) {
      const row = this.baseChars[r];
      for (let c = 0; c < cols && c < row.length; c++) {
        if (count >= revealed) {
          // Cursor position
          if (count === revealed) {
            cells.push({ row: r, col: c, char: this.cursor, brightness: 1, color: this.color });
          }
          return cells;
        }
        const ch = row[c];
        if (ch !== " ") {
          cells.push({ row: r, col: c, char: ch, brightness: 0.6, color: this.color });
        }
        count++;
      }
    }

    return cells;
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "speed", label: "Speed (chars/s)", type: "slider", min: 20, max: 1000, step: 10, defaultValue: 200 },
      { key: "cursor", label: "Cursor char", type: "text", defaultValue: "_" },
      { key: "color", label: "Color", type: "color", defaultValue: "#ffffff" },
    ];
  }
}
