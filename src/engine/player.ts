import { createEffect } from "./effects";
import type { AsciiEffect, GridInfo, MaskGrid } from "./effects/types";
import type { MaskRegion } from "./effects/types";
import { compositeFrame, collectHoles, holesChanged, punchHoles, type ActiveEffect } from "./renderer";
import { drawEffectCells } from "./effect-canvas";
import { createPlayerLoop, PlaybackClock, debounce, shouldRun } from "./player-core";
import { withSeed } from "./prng";
import { GlSceneRenderer, textToCodes } from "./gl/renderer";
import { parseCssColorPacked } from "./effects/color-util";
import { normalizeToCanvasSource } from "./canvas-util";

// The scene data is injected by the export template
declare const SCENE: {
  seed?: number;
  image: { data: string; width: number; height: number };
  ascii: { ramp: string; fontSize: string; fontFamily: string; lineHeight: number; letterSpacing: string; color: string; opacity: number; blendMode: string };
  mask: { data: string; feather: number };
  effects: Array<{
    type: string;
    enabled: boolean;
    params: Record<string, unknown>;
    timeline: { start: number; end: number | null; loop?: boolean; mode?: "continuous" | "one-shot" };
    applyToAscii: boolean;
    maskRegion: MaskRegion;
  }>;
  playback: { duration: number; fps: number; loop: boolean };
};

(function () {
  const A = document.getElementById("A") as HTMLPreElement;
  const F = document.getElementById("F") as HTMLPreElement;
  const G = document.getElementById("G") as HTMLCanvasElement;
  const GLC = document.getElementById("GLC") as HTMLCanvasElement | null;
  const bg = document.getElementById("bg") as HTMLDivElement;
  if (!A || !F) return;

  // WebGL renderer (one canvas replaces bg/base/effects/glow layers).
  // Browsers without WebGL2 keep the DOM+2D-canvas path below.
  let glr: GlSceneRenderer | null = null;
  if (GLC) {
    try {
      glr = new GlSceneRenderer(GLC);
      // A is still MEASURED for the grid (getBoundingClientRect) — hide it with
      // visibility so its geometry survives; display:none would zero the rect.
      A.style.visibility = "hidden";
      F.style.visibility = "hidden";
      for (const el of [G, bg, document.querySelector(".vig") as HTMLElement | null]) {
        if (el) el.style.display = "none";
      }
    } catch {
      glr = null;
      GLC.style.display = "none";
    }
  }

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
  let srcImage: HTMLImageElement | null = null;
  function buildAscii(cb: () => void) {
    if (!SCENE.image.data) { cb(); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      srcImage = img;
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

  // Mask support: decode base64 PNG mask and downsample to grid
  const emptyMask: MaskGrid = { get: () => 1 };
  let maskGrid: MaskGrid = emptyMask;

  function decodeMask(cb: () => void) {
    if (!SCENE.mask?.data) { cb(); return; }
    const img = new Image();
    img.onload = () => {
      const maskW = img.naturalWidth;
      const maskH = img.naturalHeight;
      const cv = document.createElement("canvas");
      cv.width = maskW; cv.height = maskH;
      const cx = cv.getContext("2d")!;
      cx.drawImage(img, 0, 0, maskW, maskH);
      const d = cx.getImageData(0, 0, maskW, maskH).data;
      // Downsample to grid: average mask values per cell
      const cellW = maskW / cols;
      const cellH = maskH / rows;
      const values = new Float32Array(cols * rows);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x0 = Math.floor(c * cellW);
          const y0 = Math.floor(r * cellH);
          const x1 = Math.min(Math.floor((c + 1) * cellW), maskW);
          const y1 = Math.min(Math.floor((r + 1) * cellH), maskH);
          let sum = 0, count = 0;
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              sum += d[(y * maskW + x) * 4]; // red channel
              count++;
            }
          }
          values[r * cols + c] = count > 0 ? sum / count / 255 : 1;
        }
      }
      maskGrid = {
        get(row: number, col: number): number {
          if (row < 0 || row >= rows || col < 0 || col >= cols) return 1;
          return values[row * cols + col];
        },
      };
      cb();
    };
    img.onerror = () => cb();
    img.src = SCENE.mask.data;
  }

  // Init effects from scene config
  const grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  let activeEffects: ActiveEffect[] = [];

  function initEffects() {
    grid.cols = cols; grid.rows = rows; grid.charW = charW; grid.charH = charH; grid.fontSize = fontSize;
    activeEffects = [];
    for (let i = 0; i < SCENE.effects.length; i++) {
      const cfg = SCENE.effects[i];
      if (!cfg.enabled) continue;
      try {
        const instance = createEffect(cfg.type);
        instance.init(grid, withSeed(cfg.params || {}, SCENE.seed, i));
        // Feed base text to text-dependent effects
        const withBaseText = instance as AsciiEffect & { setBaseText?: (text: string) => void };
        if (typeof withBaseText.setBaseText === "function") {
          withBaseText.setBaseText(baseText);
        }
        activeEffects.push({
          instance,
          maskRegion: cfg.maskRegion || "both",
          enabled: true,
          timelineStart: cfg.timeline.start,
          timelineEnd: cfg.timeline.end,
          // Legacy scenes stored timeline.loop instead of timeline.mode
          mode: cfg.timeline.mode ?? ((cfg.timeline.loop ?? true) ? "continuous" : "one-shot"),
          applyToAscii: cfg.applyToAscii ?? false,
        });
      } catch { /* unknown effect type -- skip */ }
    }
  }

  // Frame state — DOM writes happen ONLY when content actually changed.
  // (Unconditional textContent writes re-layout the whole <pre> every frame.)
  let baseLines: string[] = [];
  let lastFText = "";
  let prevHoles = new Set<number>();
  let glyphFont = "12px monospace";
  let padLeft = 8;
  let padTop = 10;

  function refreshLayoutCache() {
    const style = getComputedStyle(A);
    glyphFont = style.font || `${fontSize}px ${SCENE.ascii.fontFamily}`;
    padLeft = parseFloat(style.paddingLeft) || 8;
    padTop = parseFloat(style.paddingTop) || 10;
  }

  let baseCodes: Uint32Array | null = null;
  function configureGl() {
    if (!glr || !GLC) return;
    const wrap = GLC.parentElement!;
    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    glr.setViewport(rect.width, rect.height, dpr);
    const family = getComputedStyle(A).fontFamily || SCENE.ascii.fontFamily;
    glr.setFont({ fontSize, fontFamily: family, charW, charH, dpr });
    glr.setBackdrop(srcImage ? normalizeToCanvasSource(srcImage) : null);
    const parsed = parseCssColorPacked(SCENE.ascii.color) ?? { packed: 0xffdce6ff, alpha: 0.38 };
    glr.setSceneOptions({
      baseColor: parsed.packed,
      baseAlpha: parsed.alpha * (SCENE.ascii.opacity ?? 1),
      blendMode: SCENE.ascii.blendMode || "screen",
    });
    baseCodes = textToCodes(baseText, grid.cols, grid.rows);
  }

  function renderFrame(dt: number, t: number) {
    if (glr && baseCodes) {
      const result = compositeFrame(activeEffects, dt, t, maskGrid, grid, baseText, {
        buildText: false,
        exposeBuffers: true,
      });
      if (result.buffers && !glr.isContextLost()) {
        glr.renderFrame({ grid, baseCodes, composite: result.buffers });
      }
      return;
    }
    const result = compositeFrame(activeEffects, dt, t, maskGrid, grid, baseText, { textExcludesColored: true });

    if (result.text !== lastFText) {
      lastFText = result.text;
      F.textContent = result.text;
    }

    const holes = collectHoles(result.glowCells, result.glowCount, grid.cols);
    if (holesChanged(prevHoles, holes)) {
      prevHoles = holes;
      A.textContent = holes.size > 0 ? punchHoles(baseLines, holes, grid.cols, grid.rows) : baseText;
    }

    if (!G) return;
    if (result.glowCount > 0) {
      const dpr = window.devicePixelRatio || 1;
      const rect = G.parentElement!.getBoundingClientRect();
      const newW = Math.round(rect.width * dpr);
      const newH = Math.round(rect.height * dpr);
      if (G.width !== newW || G.height !== newH) {
        G.width = newW; G.height = newH;
        G.style.width = rect.width + "px"; G.style.height = rect.height + "px";
      }
      const ctx = G.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        drawEffectCells(ctx, result.glowCells, result.glowCount, { padLeft, padTop, charW, charH, font: glyphFont });
      }
    } else if (G.width !== 0) {
      G.width = 0; G.height = 0;
    }
  }

  // Animation. PlaybackClock excludes hidden/off-screen periods so scene time
  // resumes where it left off; createPlayerLoop guarantees a single rAF chain.
  const clock = new PlaybackClock(performance.now());
  let lastT = 0;
  let lastFrame = 0;

  function tick() {
    const dur = SCENE.playback.duration;
    const loopPlayback = SCENE.playback.loop;
    const fpsInterval = 1 / (SCENE.playback.fps || 30);
    const nowMs = performance.now();
    const wallNow = nowMs / 1000;
    if (wallNow - lastFrame < fpsInterval) return;
    lastFrame = wallNow;

    const el = clock.elapsed(nowMs) / 1000;
    if (!loopPlayback && el >= dur) {
      renderFrame(0, dur);
      playerLoop.stop();
      return;
    }
    const t = loopPlayback && dur > 0 ? el % dur : Math.min(el, dur);
    const dt = Math.min(0.05, Math.abs(t - lastT));
    if (t < lastT - 0.1) {
      // Loop wrap: reset() restores the exact t=0 state (seeded), so every
      // pass of the loop plays identically — no re-randomization.
      for (const fx of activeEffects) fx.instance.reset();
    }
    lastT = t;
    renderFrame(dt, t);
  }

  const playerLoop = createPlayerLoop(tick);
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let intersecting = true;

  // Single decision point for whether the loop runs: reduced motion renders
  // one static frame; hidden tab or off-screen player pauses (and the clock
  // stops with it, so playback resumes seamlessly).
  function gate() {
    if (reducedMotionQuery.matches) {
      playerLoop.stop();
      renderFrame(0, lastT);
      return;
    }
    if (shouldRun(!document.hidden, intersecting)) {
      clock.resume(performance.now());
      playerLoop.start();
    } else {
      clock.pause(performance.now());
      playerLoop.stop();
    }
  }

  function startPlayback() {
    initEffects();
    baseLines = baseText ? baseText.split("\n") : [];
    refreshLayoutCache();
    configureGl();
    lastFText = "";
    prevHoles = new Set();
    lastT = 0;
    lastFrame = 0;
    clock.restart(performance.now());
    gate();
  }

  document.addEventListener("visibilitychange", gate);
  if (typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver((entries) => {
      intersecting = entries[0]?.isIntersecting ?? true;
      gate();
    });
    observer.observe(A.parentElement || A);
  }
  if (typeof reducedMotionQuery.addEventListener === "function") {
    reducedMotionQuery.addEventListener("change", gate);
  }

  const handleResize = debounce(() => {
    measure();
    buildAscii(() => decodeMask(startPlayback));
  }, 150);

  buildAscii(() => decodeMask(startPlayback));
  window.addEventListener("resize", handleResize);
})();
