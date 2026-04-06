import type { SceneData } from "../scene";

/**
 * Generates an embeddable HTML snippet (iframe-friendly)
 * that can be dropped into any webpage.
 */
export function exportEmbedSnippet(scene: SceneData): string {
  const sceneB64 = typeof btoa === "function"
    ? btoa(unescape(encodeURIComponent(JSON.stringify(scene))))
    : Buffer.from(JSON.stringify(scene)).toString("base64");

  return `<!-- txtfx embed -->
<div style="position:relative;width:100%;max-width:800px;aspect-ratio:16/9;background:#0a0a0e;border-radius:8px;overflow:hidden">
  <iframe
    srcdoc='${createMinimalPlayer(scene).replace(/'/g, "&#39;")}'
    style="width:100%;height:100%;border:none"
    sandbox="allow-scripts"
    loading="lazy"
    title="txtfx scene"
  ></iframe>
</div>
<!-- /txtfx embed -->`;
}

function createMinimalPlayer(scene: SceneData): string {
  const b64 = typeof btoa === "function"
    ? btoa(unescape(encodeURIComponent(JSON.stringify(scene))))
    : Buffer.from(JSON.stringify(scene)).toString("base64");

  return `<!DOCTYPE html>
<html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#0a0a0e}
.w{position:relative;width:100%;height:100%}
.bg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:.86}
pre{position:absolute;inset:0;margin:0;padding:10px 8px;overflow:hidden;white-space:pre;user-select:none;pointer-events:none;font-weight:700;line-height:.78;letter-spacing:.06em;mix-blend-mode:screen}
.a{color:rgba(220,230,255,.38)}
.f{color:rgba(255,250,240,.95);text-shadow:0 0 6px rgba(200,220,255,.8)}
</style></head><body>
<div class="w"><div class="bg" id="b"></div>
<pre class="a" id="a"></pre><pre class="f" id="f"></pre></div>
<script>var S=JSON.parse(decodeURIComponent(escape(atob("${b64}"))));
var b=document.getElementById("b");
if(S.image.data)b.style.backgroundImage="url("+S.image.data+")";
</script></body></html>`;
}

/**
 * Generates a shareable URL with scene data encoded in the hash.
 * Only works for small scenes (URL length limits).
 */
export function generateShareURL(baseUrl: string, scene: SceneData): string {
  const json = JSON.stringify(scene);
  const encoded = typeof btoa === "function"
    ? btoa(unescape(encodeURIComponent(json)))
    : Buffer.from(json).toString("base64");
  return `${baseUrl}#scene=${encoded}`;
}
