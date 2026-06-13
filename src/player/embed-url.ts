export interface ResolveEmbedOpts {
  /** Short scene id (8 lowercase alphanumerics). Resolves to /embed/{id}. */
  sceneId?: string | null;
  /** Explicit iframe URL; wins over sceneId when present. */
  src?: string | null;
  /** Origin the player script was loaded from (where /embed lives). */
  origin?: string | null;
}

/**
 * Build the iframe URL for a <txtfx-scene>. An explicit `src` (full URL) wins;
 * otherwise a valid `scene-id` resolves against the player script's origin.
 */
export function resolveEmbedUrl(opts: ResolveEmbedOpts): string | null {
  const src = opts.src?.trim();
  if (src) return src;
  const id = opts.sceneId?.trim();
  if (id && /^[a-z0-9]{8}$/.test(id)) {
    const base = (opts.origin || "").replace(/\/$/, "");
    return `${base}/embed/${id}`;
  }
  return null;
}

/** The copy-paste embed snippet for a shared scene. */
export function webComponentSnippet(id: string, origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `<script src="${base}/v1/txtfx-scene.js" async></script>
<txtfx-scene scene-id="${id}" style="display:block;width:100%;aspect-ratio:16/9"></txtfx-scene>`;
}
