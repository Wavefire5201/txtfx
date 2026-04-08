import type { SceneData } from "../scene";
import { PLAYER_JS } from "./player-bundle";

export function exportEmbedSnippet(scene: SceneData): string {
  const playerHTML = createMinimalPlayer(scene).replace(/'/g, "&#39;");

  return `<!-- txtfx embed -->
<div style="position:relative;width:100%;max-width:800px;aspect-ratio:16/9;background:#0a0a0e;border-radius:8px;overflow:hidden">
  <iframe
    srcdoc='${playerHTML}'
    style="width:100%;height:100%;border:none"
    sandbox="allow-scripts"
    loading="lazy"
    title="txtfx scene"
  ></iframe>
</div>
<!-- /txtfx embed -->`;
}

function createMinimalPlayer(scene: SceneData): string {
  const safeJSON = JSON.stringify(scene)
    .replace(/<\//g, '<\\/')
    .replace(/<!--/g, '<\\!--');

  return `<!DOCTYPE html>
<html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#0a0a0e}
.wrap{position:relative;width:100%;height:100%}
.bg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:.86}
pre{position:absolute;inset:0;margin:0;padding:10px 8px 8px;overflow:hidden;white-space:pre;user-select:none;pointer-events:none;font-weight:700;line-height:.78;letter-spacing:.06em;mix-blend-mode:screen}
.a{color:rgba(220,230,255,.38)}
.f{color:rgba(255,250,240,.95);text-shadow:0 0 6px rgba(200,220,255,.8)}
canvas.glow{position:absolute;inset:0;pointer-events:none;z-index:3}
</style></head><body>
<div class="wrap"><div class="bg" id="bg"></div>
<pre class="a" id="A"></pre><pre class="f" id="F"></pre><canvas class="glow" id="G"></canvas></div>
<script>var SCENE=${safeJSON};</script>
<script>${PLAYER_JS}</script>
</body></html>`;
}

export function generateShareURL(baseUrl: string, scene: SceneData): string {
  const json = JSON.stringify(scene);
  const encoded = typeof btoa === "function"
    ? btoa(unescape(encodeURIComponent(json)))
    : Buffer.from(json).toString("base64");
  return `${baseUrl}#scene=${encoded}`;
}
