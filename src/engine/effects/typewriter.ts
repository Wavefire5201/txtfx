import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";

export class TypewriterEffect implements AsciiEffect {
  type = "typewriter";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private baseChars: string[][] = [];
  private speed = 80; // chars per second
  private cursor = "_";
  private color = "#ffffff";
  private glowRadius = 12;
  private _cells: EffectCell[] = [];

  init(grid: GridInfo, params: Record<string, unknown>): void {
    this.grid = grid;
    this.speed = (params.speed as number) ?? 80;
    this.cursor = (params.cursor as string) ?? "_";
    this.color = (params.color as string) ?? "#ffffff";
    this.glowRadius = (params.glowRadius as number) ?? 12;
  }

  setBaseText(text: string): void {
    this.baseChars = text.split("\n").map((line) => [...line]);
  }

  update(_dt: number, time: number, _mask: MaskGrid): EffectCell[] {
    const { cols, rows } = this.grid;
    if (this.baseChars.length === 0) return [];

    const totalChars = cols * rows;
    const revealed = Math.min(Math.floor(time * this.speed), totalChars);
    const cells = this._cells; cells.length = 0;

    // Blinking cursor (blink every 0.5s)
    const cursorVisible = Math.floor(time * 2) % 2 === 0;

    let count = 0;
    let cursorPlaced = false;
    for (let r = 0; r < rows && r < this.baseChars.length; r++) {
      const row = this.baseChars[r];
      for (let c = 0; c < cols && c < row.length; c++) {
        if (count >= revealed) {
          // Place cursor at the reveal edge
          if (!cursorPlaced && cursorVisible) {
            cells.push({ row: r, col: c, char: this.cursor, brightness: 1, color: this.color, glowRadius: this.glowRadius });
            cursorPlaced = true;
          }
          return cells;
        }
        const ch = row[c];
        if (ch !== " ") {
          // Recently revealed chars glow brighter, then settle
          const charAge = (revealed - count) / this.speed; // seconds since this char was revealed
          const brightness = charAge < 0.05 ? 1.0 : charAge < 0.2 ? 0.85 : 0.7;
          cells.push({ row: r, col: c, char: ch, brightness, color: this.color, glowRadius: charAge < 0.1 ? this.glowRadius : undefined });
        }
        count++;
      }
    }

    // All chars revealed — show blinking cursor at the end
    if (!cursorPlaced && cursorVisible && this.baseChars.length > 0) {
      const lastRow = Math.min(rows, this.baseChars.length) - 1;
      const lastCol = Math.min(cols, this.baseChars[lastRow]?.length ?? 0);
      if (lastCol < cols) {
        cells.push({ row: lastRow, col: lastCol, char: this.cursor, brightness: 1, color: this.color, glowRadius: this.glowRadius });
      }
    }

    return cells;
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "speed", label: "Speed (chars/s)", type: "slider", min: 10, max: 500, step: 5, defaultValue: 80 },
      { key: "cursor", label: "Cursor char", type: "text", defaultValue: "_" },
      { key: "color", label: "Color", type: "color", defaultValue: "#ffffff" },
      { key: "glowRadius", label: "Glow radius", type: "slider", min: 0, max: 40, step: 1, defaultValue: 12 },
    ];
  }
}
