import { packRGB } from "../cell-buffer";

export type ColorMode = "random" | "cycle" | "gradient";

// ---------------------------------------------------------------------------
// Packed-u32 color path (0xFFRRGGBB). Effects parse their palettes ONCE in
// init() and work in integers; hex strings only exist at the canvas boundary.
// lerp math mirrors the string versions exactly (same rounding/clamping), so
// converting an effect changes its storage format, not its colors.
// ---------------------------------------------------------------------------

export const WHITE_PACKED = packRGB(255, 255, 255);

/** Parses #rgb / #rrggbb into a packed color; invalid input → white. */
export function packHex(hex: string): number {
  if (!hex || hex[0] !== "#") return WHITE_PACKED;
  const h = hex.slice(1);
  if (h.length === 3) {
    return packRGB(
      parseInt(h[0] + h[0], 16) || 0,
      parseInt(h[1] + h[1], 16) || 0,
      parseInt(h[2] + h[2], 16) || 0,
    );
  }
  return packRGB(
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  );
}

function clampChannel(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** Exact integer mirror of lerpColor (same Math.round + clamp per channel). */
export function lerpPackedColor(a: number, b: number, t: number): number {
  const ar = (a >>> 16) & 0xff, ag = (a >>> 8) & 0xff, ab = a & 0xff;
  const br = (b >>> 16) & 0xff, bg = (b >>> 8) & 0xff, bb = b & 0xff;
  return packRGB(
    clampChannel(ar + (br - ar) * t),
    clampChannel(ag + (bg - ag) * t),
    clampChannel(ab + (bb - ab) * t),
  );
}

/** Packed mirror of pickColor — same selection semantics. */
export function pickColorPacked(colors: number[], mode: ColorMode, index: number, t?: number): number {
  if (colors.length === 0) return WHITE_PACKED;
  if (colors.length === 1) return colors[0];
  switch (mode) {
    case "random":
    case "cycle":
      return colors[index % colors.length];
    case "gradient": {
      if (t === undefined) return colors[0];
      const pos = t * (colors.length - 1);
      const i = Math.floor(pos);
      const frac = pos - i;
      if (i >= colors.length - 1) return colors[colors.length - 1];
      return lerpPackedColor(colors[i], colors[i + 1], frac);
    }
  }
}

/** readColors + packHex in one step. */
export function readColorsPacked(params: Record<string, unknown>, defaultColor: string): number[] {
  return readColors(params, defaultColor).map(packHex);
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

export function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return toHex(
    ar + (br - ar) * t,
    ag + (bg - ag) * t,
    ab + (bb - ab) * t,
  );
}

/**
 * Pick a color from the palette based on the color mode.
 * @param colors  array of hex colors
 * @param mode    how to pick colors
 * @param index   particle/spawn index (for cycle mode)
 * @param t       lifecycle 0-1 (for gradient mode)
 */
export function pickColor(
  colors: string[],
  mode: ColorMode,
  index: number,
  t?: number,
): string {
  if (colors.length === 0) return "#ffffff";
  if (colors.length === 1) return colors[0];

  switch (mode) {
    case "random":
      return colors[index % colors.length];
    case "cycle":
      return colors[index % colors.length];
    case "gradient": {
      if (t === undefined) return colors[0];
      const pos = t * (colors.length - 1);
      const i = Math.floor(pos);
      const frac = pos - i;
      if (i >= colors.length - 1) return colors[colors.length - 1];
      return lerpColor(colors[i], colors[i + 1], frac);
    }
  }
}

/** Read colors from params with backward-compatible fallback. */
export function readColors(params: Record<string, unknown>, defaultColor: string): string[] {
  const raw = params.colors as string[] | undefined;
  const legacy = params.color as string | undefined;
  return raw ?? (legacy ? [legacy] : [defaultColor]);
}

/** Read colorMode from params with default. */
export function readColorMode(params: Record<string, unknown>): ColorMode {
  return (params.colorMode as ColorMode) ?? "random";
}

/** Standard color controls to replace single color control. */
export function colorControls(defaultColor: string): import("./types").ControlDescriptor[] {
  return [
    { key: "colors", label: "Colors", type: "colors", defaultValue: [defaultColor] },
    {
      key: "colorMode", label: "Color mode", type: "select",
      options: [
        { label: "Random", value: "random" },
        { label: "Cycle", value: "cycle" },
        { label: "Gradient", value: "gradient" },
      ],
      defaultValue: "random",
    },
  ];
}
