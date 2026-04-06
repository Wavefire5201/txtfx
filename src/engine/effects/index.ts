import type { AsciiEffect, EffectType } from "./types";
import { TwinkleEffect } from "./twinkle";
import { MeteorEffect } from "./meteor";
import { RainEffect } from "./rain";
import { SnowEffect } from "./snow";
import { FireEffect } from "./fire";
import { MatrixEffect } from "./matrix";
import { WavesEffect } from "./waves";
import { GlitchEffect } from "./glitch";
import { TypewriterEffect } from "./typewriter";
import { DecodeEffect } from "./decode";
import { FireworkEffect } from "./firework";
import { CustomEmitterEffect } from "./custom-emitter";

const EFFECT_CONSTRUCTORS: Record<EffectType, new () => AsciiEffect> = {
  twinkle: TwinkleEffect,
  meteor: MeteorEffect,
  rain: RainEffect,
  snow: SnowEffect,
  fire: FireEffect,
  matrix: MatrixEffect,
  waves: WavesEffect,
  glitch: GlitchEffect,
  typewriter: TypewriterEffect,
  decode: DecodeEffect,
  firework: FireworkEffect,
  "custom-emitter": CustomEmitterEffect,
};

export function createEffect(type: EffectType): AsciiEffect {
  const Ctor = EFFECT_CONSTRUCTORS[type];
  if (!Ctor) throw new Error(`Unknown effect type: ${type}`);
  return new Ctor();
}

export const EFFECT_LABELS: Record<EffectType, { label: string; icon: string }> = {
  twinkle: { label: "Twinkle Stars", icon: "\u2B50" },
  meteor: { label: "Meteors", icon: "\u2604\uFE0F" },
  rain: { label: "Rain", icon: "\uD83C\uDF27" },
  snow: { label: "Snow", icon: "\u2744\uFE0F" },
  fire: { label: "Fire", icon: "\uD83D\uDD25" },
  matrix: { label: "Matrix Rain", icon: "\uD83D\uDFE2" },
  waves: { label: "Waves", icon: "\uD83C\uDF0A" },
  glitch: { label: "Glitch", icon: "\u26A1" },
  typewriter: { label: "Typewriter", icon: "\u2328\uFE0F" },
  decode: { label: "Decode", icon: "\uD83D\uDD13" },
  firework: { label: "Firework", icon: "\uD83C\uDF86" },
  "custom-emitter": { label: "Custom Emitter", icon: "\u2699\uFE0F" },
};

export { type AsciiEffect, type EffectType, type EffectCell, type GridInfo, type MaskGrid } from "./types";
