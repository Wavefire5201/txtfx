import { createEffect } from "./effects";
import type { AsciiEffect, GridInfo, MaskGrid, EffectCell } from "./effects/types";

// The scene data is injected by the export template
declare const SCENE: {
  image: { data: string };
  ascii: { ramp: string; fontSize: string; fontFamily: string; lineHeight: number; letterSpacing: string; color: string; opacity: number; blendMode: string };
  effects: Array<{
    type: string;
    enabled: boolean;
    params: Record<string, unknown>;
    timeline: { start: number; end: number | null; loop?: boolean; mode?: "continuous" | "one-shot" };
    applyToAscii: boolean;
    maskRegion: string;
  }>;
  playback: { duration: number; fps: number; loop: boolean };
};

(function () {
  const A = document.getElementById("A") as HTMLPreElement;
  const F = document.getElementById("F") as HTMLPreElement;
  const G = document.getElementById("G") as HTMLCanvasElement;
  const bg = document.getElementById("bg") as HTMLDivElement;
  if (!A || !F) return;

  // Apply styles
  const s = SCENE.ascii;
  const ps = `font-size:${s.fontSize};font-family:${s.fontFamily};line-height:${s.lineHeight};letter-spacing:${s.letterSpacing}`;
  A.setAttribute("style", A.getAttribute("style") + ";" + ps + ";color:" + s.color + ";opacity:" + s.opacity);
  F.setAttribute("style", F.getAttribute("style") + ";" + ps);
  if (SCENE.image.data && bg) bg.style.backgroundImage = `url("${SCENE.image.data}")`;

  // Measure grid
  let cols = 80, rows = 40, charW = 6, charH = 9, fontSize = 12;
  function measure() {
    const style = getComputedStyle(A);
    const fs = parseFloat(style.fontSize);
    fontSize = fs;
    // Measure actual character width
    const span = document.createElement("span");
    span.style.font = style.font;
    span.style.letterSpacing = style.letterSpacing;
    span.style.position = "absolute";
    span.style.visibility = "hidden";
    span.style.whiteSpace = "pre";
    span.textContent = "XXXXXXXXXXXXXXXXXXXX";
    document.body.appendChild(span);
    charW = span.getBoundingClientRect().width / 20;
    document.body.removeChild(span);
    charH = parseFloat(style.lineHeight) || fs * 0.78;
    const rect = A.getBoundingClientRect();
    cols = Math.floor((rect.width - 16) / charW);
    rows = Math.floor((rect.height - 18) / charH);
  }

  // Build ASCII from image
  let baseText = "";
  function buildAscii(cb: () => void) {
    if (!SCENE.image.data) { cb(); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      measure();
      const cv = document.createElement("canvas");
      cv.width = cols; cv.height = rows;
      const cx = cv.getContext("2d")!;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const ia = iw / ih, ca = cols / rows;
      let sx = 0, sy = 0, sw = iw, sh = ih;
      if (ia > ca) { sw = ih * ca; sx = (iw - sw) / 2; }
      else { sh = iw / ca; sy = (ih - sh) / 2; }
      cx.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);
      const d = cx.getImageData(0, 0, cols, rows).data;
      const ramp = SCENE.ascii.ramp || " .`,:;cbaO0%#@";
      let out = "";
      for (let y = 0; y < rows; y++) {
        let ln = "";
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
          ln += ramp[Math.floor(Math.pow(1 - l, 1) * (ramp.length - 1))];
        }
        out += ln + "\n";
      }
      baseText = out;
      A.textContent = out;
      cb();
    };
    img.src = SCENE.image.data;
  }

  // Empty mask (no masking in export)
  const emptyMask: MaskGrid = { get: () => 1 };

  // Init effects from scene config
  const grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  let activeEffects: Array<{
    instance: AsciiEffect;
    start: number;
    end: number | null;
    continuous: boolean;
    color: string | null;
    glowRadius: number | null;
  }> = [];

  function initEffects() {
    grid.cols = cols; grid.rows = rows; grid.charW = charW; grid.charH = charH; grid.fontSize = fontSize;
    activeEffects = [];
    for (const cfg of SCENE.effects) {
      if (!cfg.enabled) continue;
      try {
        const instance = createEffect(cfg.type);
        instance.init(grid, cfg.params || {});
        // Feed base text to text-dependent effects
        if ("setBaseText" in instance && typeof (instance as any).setBaseText === "function") {
          (instance as any).setBaseText(baseText);
        }
        activeEffects.push({
          instance,
          start: cfg.timeline.start,
          end: cfg.timeline.end,
          continuous: cfg.timeline.mode ? cfg.timeline.mode === "continuous" : (cfg.timeline.loop ?? true),
          color: (cfg.params?.color as string) || null,
          glowRadius: (cfg.params?.glowRadius as number) || null,
        });
      } catch { /* unknown effect type -- skip */ }
    }
  }

  function hexToRGB(hex: string): [number, number, number] | null {
    if (!hex || hex[0] !== "#") return null;
    return [
      parseInt(hex.slice(1, 3), 16) || 0,
      parseInt(hex.slice(3, 5), 16) || 0,
      parseInt(hex.slice(5, 7), 16) || 0,
    ];
  }

  // Glow sprite cache (inline for bundled IIFE)
  const _glowCache = new Map<string, HTMLCanvasElement>();
  function _getGlowSprite(cR: number, cG: number, cB: number, radius: number, brightness: number): HTMLCanvasElement {
    const qB = Math.round(brightness * 15) / 15;
    const qR = Math.round(radius);
    if (qR <= 0) return _getGlowSprite(cR, cG, cB, 1, brightness);
    const key = `${cR},${cG},${cB},${qR},${qB}`;
    let s = _glowCache.get(key);
    if (s) return s;
    s = document.createElement("canvas");
    s.width = qR * 2; s.height = qR * 2;
    const c = s.getContext("2d")!;
    const g = c.createRadialGradient(qR, qR, 0, qR, qR, qR);
    g.addColorStop(0, `rgba(${cR},${cG},${cB},${qB * 0.7})`);
    g.addColorStop(0.4, `rgba(${cR},${cG},${cB},${qB * 0.28})`);
    g.addColorStop(1, `rgba(${cR},${cG},${cB},0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, qR * 2, qR * 2);
    _glowCache.set(key, s);
    return s;
  }

  // Module-scoped buffers (reused across frames, resized only on grid change)
  let _brightMap = new Float32Array(0);
  let _charBuf: string[] = [];
  let _bufSize = 0;

  // Animation
  function animate() {
    initEffects();
    const t0 = performance.now();
    const dur = SCENE.playback.duration;
    const loop = SCENE.playback.loop;
    const fpsInterval = 1 / (SCENE.playback.fps || 30);
    let lastT = 0;
    let lastFrame = 0;
    let raf = 0;
    const dpr = window.devicePixelRatio || 1;

    function tick() {
      const wallNow = performance.now() / 1000;
      if (wallNow - lastFrame < fpsInterval) { raf = requestAnimationFrame(tick); return; }
      lastFrame = wallNow;

      const el = (performance.now() - t0) / 1000;
      const t = loop && dur > 0 ? el % dur : Math.min(el, dur);
      if (!loop && el > dur) return;
      const dt = Math.min(0.05, Math.abs(t - lastT));
      if (t < lastT - 0.1) initEffects();
      lastT = t;

      // Collect cells from all effects
      interface Cell extends EffectCell { rgb?: [number, number, number]; gr?: number | null; }
      const allCells: Cell[] = [];
      for (const a of activeEffects) {
        if (t < a.start) continue;
        if (a.end !== null && t > a.end) continue;
        let effectTime = t - a.start;
        if (a.continuous && a.end !== null) {
          const effectDur = a.end - a.start;
          if (effectDur > 0) effectTime = effectTime % effectDur;
        }
        const cells = a.instance.update(dt, effectTime, emptyMask);
        for (const c of cells) {
          const cell = c as Cell;
          if (a.color) cell.rgb = hexToRGB(a.color) ?? undefined;
          if (a.glowRadius != null) cell.gr = a.glowRadius;
          allCells.push(cell);
        }
      }

      // Composite to text grid (reuse buffers)
      const total = cols * rows;
      if (total !== _bufSize) {
        _brightMap = new Float32Array(total);
        _charBuf = new Array(total);
        _bufSize = total;
      }
      _brightMap.fill(0);
      _charBuf.fill(" ");

      for (const cell of allCells) {
        if (cell.row < 0 || cell.row >= rows || cell.col < 0 || cell.col >= cols) continue;
        const idx = cell.row * cols + cell.col;
        const b = cell.brightness ?? 0.5;
        if (b > _brightMap[idx]) {
          _brightMap[idx] = b;
          _charBuf[idx] = cell.char;
        }
      }
      let text = "";
      for (let r = 0; r < rows; r++) {
        if (r > 0) text += "\n";
        for (let c = 0; c < cols; c++) text += _charBuf[r * cols + c];
      }
      F.textContent = text;

      // Glow canvas
      if (G) {
        const hasGlow = allCells.some(c => (c as Cell).rgb);
        if (hasGlow) {
          const rect = G.parentElement!.getBoundingClientRect();
          const newW = rect.width * dpr, newH = rect.height * dpr;
          if (G.width !== newW || G.height !== newH) {
            G.width = newW; G.height = newH;
            G.style.width = rect.width + "px"; G.style.height = rect.height + "px";
          }
          const ctx = G.getContext("2d");
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, rect.width, rect.height);
            ctx.font = `${fontSize}px ${SCENE.ascii.fontFamily}`;
            ctx.textBaseline = "top";

            // Pass 1: Draw glow sprites
            let prevHex = "";
            let cR = 0, cG = 0, cB = 0;
            for (const cell of allCells) {
              const c = cell as Cell;
              if (!c.rgb || c.row < 0 || c.row >= rows || c.col < 0 || c.col >= cols) continue;
              const a = c.brightness ?? 0.5;
              const gr = c.gr ?? (4 + 14 * a);
              if (gr <= 0) continue;
              const x = 8 + c.col * charW, y = 10 + c.row * charH;
              const cx = x + charW * 0.5, cy = y + charH * 0.5;
              const color = c.color || "#ffffff";
              if (color !== prevHex) { prevHex = color; [cR, cG, cB] = c.rgb; }
              const sprite = _getGlowSprite(cR, cG, cB, gr, a);
              ctx.drawImage(sprite, cx - gr, cy - gr, gr * 2, gr * 2);
            }

            // Pass 2: Draw text (no shadowBlur — glow sprite handles it)
            prevHex = "";
            for (const cell of allCells) {
              const c = cell as Cell;
              if (!c.rgb || c.row < 0 || c.row >= rows || c.col < 0 || c.col >= cols) continue;
              const x = 8 + c.col * charW, y = 10 + c.row * charH;
              const color = c.color || "#ffffff";
              if (color !== prevHex) {
                prevHex = color;
                [cR, cG, cB] = c.rgb;
                ctx.fillStyle = `rgb(${cR},${cG},${cB})`;
              }
              ctx.globalAlpha = Math.min(1, (c.brightness ?? 0.5) * 0.95);
              ctx.fillText(c.char, x, y);
            }
            ctx.globalAlpha = 1;
          }
        } else {
          G.width = 0; G.height = 0;
        }
      }

      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
  }

  buildAscii(animate);
  window.addEventListener("resize", () => { measure(); buildAscii(animate); });
})();
