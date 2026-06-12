/**
 * Seeded PRNG for deterministic effects.
 *
 * Every effect instance owns a mulberry32 stream seeded from
 * (scene seed, effect index). Same seed + same update sequence =>
 * identical frames: reproducible exports, scrub-stable previews,
 * loop playback that looks the same every pass, and snapshot tests.
 */

/** mulberry32 — tiny, fast, good distribution for visual effects. */
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

/** Mixes a base seed with stream indices (effect index, entity id, ...). */
export function deriveSeed(base: number, ...indices: number[]): number {
  let h = base >>> 0;
  for (const index of indices) {
    h = Math.imul(h ^ (index + 0x9e3779b9), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/** Param key hosts use to inject the derived per-effect seed. */
export const SEED_PARAM = "__seed";

export function readSeed(params: Record<string, unknown>): number {
  const raw = params[SEED_PARAM];
  return typeof raw === "number" && Number.isFinite(raw) ? raw >>> 0 : 1;
}

/** Params with the per-effect seed injected (hosts call this at init sites). */
export function withSeed(
  params: Record<string, unknown>,
  sceneSeed: number | undefined,
  effectIndex: number,
): Record<string, unknown> {
  return { ...params, [SEED_PARAM]: deriveSeed(sceneSeed ?? 1, effectIndex) };
}
