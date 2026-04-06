export interface GridInfo {
  cols: number;
  rows: number;
  charW: number;
  charH: number;
  fontSize: number;
}

export interface MaskGrid {
  /** Returns 0-1 at grid position. 0 = foreground, 1 = background. */
  get(row: number, col: number): number;
}

export interface EffectCell {
  row: number;
  col: number;
  char: string;
  brightness?: number;
  color?: string;
  glowRadius?: number;
}

export interface ControlDescriptor {
  key: string;
  label: string;
  type: "slider" | "select" | "toggle" | "text" | "color";
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string }[];
  defaultValue: number | string | boolean;
}

export interface AsciiEffect {
  type: string;
  init(grid: GridInfo, params: Record<string, unknown>): void;
  update(dt: number, time: number, mask: MaskGrid): EffectCell[];
  getControls(): ControlDescriptor[];
}

export type MaskRegion = "foreground" | "background" | "both";

export type EffectType =
  | "twinkle"
  | "meteor"
  | "rain"
  | "snow"
  | "fire"
  | "matrix"
  | "waves"
  | "glitch"
  | "typewriter"
  | "decode"
  | "firework"
  | "custom-emitter";
