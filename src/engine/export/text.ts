import { compositeFrame, type ActiveEffect, type CompositeResult } from "../renderer";
import type { GridInfo, MaskGrid } from "../effects/types";
import { parseColor } from "./video";

const ANSI_RESET = "\u001b[0m";

export function renderPlainTextFrame(
  activeEffects: ActiveEffect[],
  grid: GridInfo,
  mask: MaskGrid,
  baseText: string,
  time: number,
  dt: number,
): string {
  return compositeFrame(activeEffects, dt, time, mask, grid, baseText).text;
}

export function renderAnsiFrame(
  activeEffects: ActiveEffect[],
  grid: GridInfo,
  mask: MaskGrid,
  baseText: string,
  time: number,
  dt: number,
): string {
  const result = compositeFrame(activeEffects, dt, time, mask, grid, baseText);
  if (result.glowCount === 0) return result.text;

  const lines = result.text.split("\n").map((line) => line.split(""));
  const colors = new Map<number, string>();

  for (let i = 0; i < result.glowCount; i++) {
    const cell = result.glowCells[i];
    colors.set(cell.row * grid.cols + cell.col, cell.color);
    if (lines[cell.row]?.[cell.col] === " ") {
      lines[cell.row][cell.col] = cell.char;
    }
  }

  return lines.map((line, row) => {
    let out = "";
    let activeColor = "";
    for (let col = 0; col < line.length; col++) {
      const color = colors.get(row * grid.cols + col) ?? "";
      if (color !== activeColor) {
        out += color ? ansiColor(color) : ANSI_RESET;
        activeColor = color;
      }
      out += line[col];
    }
    return activeColor ? out + ANSI_RESET : out;
  }).join("\n");
}

export function renderTerminalTextFrame(
  activeEffects: ActiveEffect[],
  grid: GridInfo,
  mask: MaskGrid,
  baseText: string,
  time: number,
  dt: number,
): string {
  const result = compositeFrame(activeEffects, dt, time, mask, grid, baseText);
  return buildTerminalFrame(result, grid, baseText).text;
}

export function renderTerminalAnsiFrame(
  activeEffects: ActiveEffect[],
  grid: GridInfo,
  mask: MaskGrid,
  baseText: string,
  time: number,
  dt: number,
): string {
  const result = compositeFrame(activeEffects, dt, time, mask, grid, baseText);
  const { lines, text, colors } = buildTerminalFrame(result, grid, baseText);
  if (colors.size === 0) return text;

  return lines.map((line, row) => {
    let out = "";
    let activeColor = "";
    for (let col = 0; col < grid.cols; col++) {
      const color = colors.get(row * grid.cols + col) ?? "";
      if (color !== activeColor) {
        out += color ? ansiColor(color) : ANSI_RESET;
        activeColor = color;
      }
      out += line[col] ?? " ";
    }
    return activeColor ? out + ANSI_RESET : out;
  }).join("\n");
}

export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

function ansiColor(color: string): string {
  const parsed = parseColor(color);
  if (!parsed) return "";
  return `\u001b[38;2;${parsed[0]};${parsed[1]};${parsed[2]}m`;
}

function buildTerminalFrame(
  result: CompositeResult,
  grid: GridInfo,
  baseText: string,
): { lines: string[][]; text: string; colors: Map<number, string> } {
  const lines = baseLines(baseText, grid);
  const effectLines = result.text.split("\n");

  for (let row = 0; row < grid.rows; row++) {
    const effectLine = effectLines[row] ?? "";
    for (let col = 0; col < grid.cols; col++) {
      const ch = effectLine[col] ?? " ";
      if (ch !== " ") lines[row][col] = ch;
    }
  }

  const colors = new Map<number, string>();
  for (let i = 0; i < result.glowCount; i++) {
    const cell = result.glowCells[i];
    if (cell.row < 0 || cell.row >= grid.rows || cell.col < 0 || cell.col >= grid.cols) continue;
    colors.set(cell.row * grid.cols + cell.col, cell.color);
    if (!cell.asciiOverlay && lines[cell.row]?.[cell.col] === " ") {
      lines[cell.row][cell.col] = cell.char;
    }
  }

  return {
    lines,
    text: lines.map((line) => line.join("")).join("\n"),
    colors,
  };
}

function baseLines(baseText: string, grid: GridInfo): string[][] {
  const source = baseText.split("\n");
  const lines: string[][] = [];
  for (let row = 0; row < grid.rows; row++) {
    const line = source[row] ?? "";
    lines.push(line.slice(0, grid.cols).padEnd(grid.cols, " ").split(""));
  }
  return lines;
}
