export type ColorMode = "random" | "cycle" | "gradient";

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

function lerpColor(a: string, b: string, t: number): string {
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
