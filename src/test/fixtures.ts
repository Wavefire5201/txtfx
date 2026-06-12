/**
 * Deterministic test fixtures shared by unit and browser test suites.
 *
 * Until effects are seeded (deterministic-effects phase), reproducible tests
 * must stub Math.random via seedMathRandom() around any effect init/update.
 */
import type { SceneData, EffectConfig } from "@/engine/scene";
import { createDefaultScene } from "@/engine/scene";
import type { EffectType } from "@/engine/effects/types";

/** mulberry32 — tiny seeded PRNG, good enough for test reproducibility. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Replaces Math.random with a seeded PRNG. Returns a restore function —
 * always call it in a finally block.
 */
export function seedMathRandom(seed = 42): () => void {
  const original = Math.random;
  Math.random = mulberry32(seed);
  return () => {
    Math.random = original;
  };
}

let effectId = 0;

export function makeEffect(
  type: EffectType,
  params: Record<string, unknown> = {},
  overrides: Partial<EffectConfig> = {},
): EffectConfig {
  return {
    id: `fx-test-${effectId++}`,
    type,
    enabled: true,
    maskRegion: "both",
    params,
    timeline: { start: 0, end: null, mode: "continuous" },
    applyToAscii: false,
    ...overrides,
  };
}

/**
 * A scene with pixel-exact, environment-stable styling: px font size,
 * generic monospace family, no letter spacing surprises.
 */
export function makeScene(overrides: Partial<SceneData> = {}): SceneData {
  const scene = createDefaultScene();
  scene.ascii = {
    ...scene.ascii,
    fontSize: "12px",
    fontFamily: "monospace",
    lineHeight: 1,
    letterSpacing: "0px",
    blendMode: "screen",
    opacity: 0.8,
    color: "#dce6ff",
  };
  scene.playback = { duration: 4, fps: 30, loop: true };
  return { ...scene, ...overrides, ascii: { ...scene.ascii, ...overrides.ascii } };
}

/** Canonical fixture scenes, one per rendering feature under test. */
export const fixtureScenes = {
  /** Base text + backdrop only — fully deterministic without seeding. */
  baseOnly: () => makeScene(),
  /** Regular colored effects with glow. */
  effects: () =>
    makeScene({
      effects: [
        makeEffect("matrix", { density: 0.5, colors: ["#00ff41"], glowRadius: 8 }),
        makeEffect("firework", { intervalMin: 0.5, intervalMax: 0.5, colors: ["#ff4060"] }),
      ],
    }),
  /** applyToAscii cells must hole-punch base text and colorize base chars. */
  applyToAscii: () =>
    makeScene({
      effects: [
        makeEffect("twinkle", { colors: ["#ffd060"], glowRadius: 10 }, { applyToAscii: true }),
      ],
    }),
  /** Non-zero letter spacing forces per-cell text layout. */
  letterSpacing: () =>
    makeScene({
      ascii: { ...makeScene().ascii, letterSpacing: "2px" },
      effects: [makeEffect("rain", { colors: ["#60a0ff"] })],
    }),
  /** One scene per supported blend mode (parameterize tests over this). */
  blendMode: (mode: string) => makeScene({ ascii: { ...makeScene().ascii, blendMode: mode } }),
};

export const BLEND_MODES = ["screen", "normal", "lighten", "overlay", "soft-light"] as const;

// ---------------------------------------------------------------------------
// Browser-only image helpers (require document) — do not call from unit tests.
// ---------------------------------------------------------------------------

/**
 * Draws a deterministic test image: horizontal luminance gradient, a bright
 * circle, and a dark band — exercises the full ASCII ramp without binary assets.
 */
export function makeTestImageDataUrl(w = 320, h = 200): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, "#06070c");
  grad.addColorStop(1, "#c8d4ff");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(w * 0.3, h * 0.4, h * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#10131c";
  ctx.fillRect(0, h * 0.75, w, h * 0.15);
  return canvas.toDataURL("image/png");
}

export function loadTestImage(w = 320, h = 200): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = makeTestImageDataUrl(w, h);
  });
}
