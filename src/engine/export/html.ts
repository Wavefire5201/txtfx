import type { SceneData } from "../scene";
import { PLAYER_JS } from "./player-bundle";

export function exportStandaloneHTML(scene: SceneData): string {
  const safeJSON = JSON.stringify(scene)
    .replace(/<\//g, '<\\/')
    .replace(/<!--/g, '<\\!--');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>txtfx scene</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#0a0a0e}
.wrap{position:relative;width:100%;height:100%}
.bg{position:absolute;inset:0;background-size:cover;background-position:center;transform:scale(1.03);opacity:.86}
.vig{position:absolute;inset:0;background:radial-gradient(at left top,rgba(0,0,0,.45),transparent 50%),radial-gradient(at right top,rgba(0,0,0,.45),transparent 50%),radial-gradient(at left bottom,rgba(0,0,0,.45),transparent 50%),radial-gradient(at right bottom,rgba(0,0,0,.45),transparent 50%)}
pre{position:absolute;inset:0;margin:0;padding:10px 8px 8px;overflow:hidden;white-space:pre;user-select:none;pointer-events:none;font-weight:700}
.a{mix-blend-mode:screen;color:rgba(220,230,255,.38);text-shadow:0 0 8px rgba(255,255,255,.04),0 0 16px rgba(140,180,255,.03);z-index:2}
.f{mix-blend-mode:normal;color:rgba(255,250,240,.95);text-shadow:0 0 6px rgba(200,220,255,.8),0 0 14px rgba(160,200,255,.4);z-index:3}
canvas.glow{position:absolute;inset:0;pointer-events:none;z-index:4}
.info{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);background:rgba(26,26,31,.85);padding:6px 14px;border-radius:8px;backdrop-filter:blur(8px);font:11px system-ui;color:#666;letter-spacing:.02em}
</style>
</head>
<body>
<div class="wrap">
  <div class="bg" id="bg"></div>
  <div class="vig"></div>
  <pre class="a" id="A"></pre>
  <pre class="f" id="F"></pre>
  <canvas class="glow" id="G"></canvas>
  <div class="info">Made with txtfx</div>
</div>
<script>var SCENE=${safeJSON};</script>
<script>${PLAYER_JS}</script>
</body>
</html>`;
}
