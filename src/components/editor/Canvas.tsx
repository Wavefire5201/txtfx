"use client";

import { useRef, useEffect, useLayoutEffect, useCallback, useState } from "react";
import { useEditorStore, animationTime, pushMaskHistory } from "@/lib/store";
import { loadState } from "@/lib/cache";
import { Mask, IncrementalMaskGrid, type MaskDirtyRect } from "@/engine/mask";
import { measureGrid, imageToAscii, sampleMeanColor } from "@/engine/ascii";
import { createEffect } from "@/engine/effects";
import { compositeFrame, collectHoles, holesChanged, punchHoles, type ActiveEffect, type GlowCell } from "@/engine/renderer";
import { drawEffectCells, type EffectCanvasLayout } from "@/engine/effect-canvas";
import type { GridInfo, MaskGrid } from "@/engine/effects/types";
import { withSeed } from "@/engine/prng";
import { GlSceneRenderer, textToCodes } from "@/engine/gl/renderer";
import { packRGB } from "@/engine/cell-buffer";
import { parseColor } from "@/engine/export/video";
import { ImageSquare, UploadSimple, ChartLine, Minus, Plus, ArrowCounterClockwise } from "@phosphor-icons/react";
import { toast } from "./Toast";
import type { TypewriterEffect } from "@/engine/effects/typewriter";
import type { DecodeEffect } from "@/engine/effects/decode";

const EMPTY_MASK: MaskGrid = { get: () => 1 };

export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const asciiRef = useRef<HTMLPreElement>(null);
  const glowCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskOverlayRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const imageUrl = useEditorStore((s) => s.imageUrl);
  const setImageUrl = useEditorStore((s) => s.setImageUrl);
  // Fine-grained selectors: Canvas only re-renders when these specific fields change.
  // ASCII visual props (opacity, blendMode, color, etc.) are applied via refs elsewhere
  // to bypass React re-renders during slider drags.
  const sceneEffects = useEditorStore((s) => s.scene.effects);
  const sceneSeed = useEditorStore((s) => s.scene.seed);
  const asciiRamp = useEditorStore((s) => s.scene.ascii.ramp);
  const playbackDuration = useEditorStore((s) => s.scene.playback.duration);
  const playbackLoop = useEditorStore((s) => s.scene.playback.loop);
  const playbackFps = useEditorStore((s) => s.scene.playback.fps);
  const showAscii = useEditorStore((s) => s.showAscii);
  const showEffects = useEditorStore((s) => s.showEffects);
  const showMask = useEditorStore((s) => s.showMask);
  const showImage = useEditorStore((s) => s.showImage);
  const playing = useEditorStore((s) => s.playing);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const currentTime = useEditorStore((s) => s.currentTime);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const activeTool = useEditorStore((s) => s.activeTool);
  const brushSize = useEditorStore((s) => s.brushSize);
  const maskFeather = useEditorStore((s) => s.maskFeather);
  const initMask = useEditorStore((s) => s.initMask);
  const maskVersion = useEditorStore((s) => s.maskVersion);
  const bumpMaskVersion = useEditorStore((s) => s.bumpMaskVersion);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const panX = useEditorStore((s) => s.panX);
  const panY = useEditorStore((s) => s.panY);
  const setPan = useEditorStore((s) => s.setPan);

  const [grid, setGrid] = useState<GridInfo>({ cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 });
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [displayRect, setDisplayRect] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [draggingOver, setDraggingOver] = useState(false);
  const [showPerf, setShowPerf] = useState(true);
  // GL renderer A/B toggle (?gl=1 enables; HUD button flips live)
  const [useGl, setUseGl] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("gl") === "1") setUseGl(true);
  }, []);
  const [perfText, setPerfText] = useState("0 fps · render 0.0ms · 0 cells");

  const imgRef = useRef<HTMLImageElement | null>(null);
  const effectsRef = useRef<ActiveEffect[]>([]);
  const asciiTextRef = useRef<string>("");
  const animRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const lastTimeRef = useRef(0);
  const lastRenderedTimeRef = useRef(0);
  const isPaintingRef = useRef(false);
  const lastPaintRef = useRef<{ x: number; y: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number } | null>(null);
  const maskGridRef = useRef<MaskGrid>(EMPTY_MASK);
  const incrementalMaskRef = useRef<IncrementalMaskGrid | null>(null);
  const wasPlayingRef = useRef(false);
  const pauseGuardRef = useRef(0);
  const perfFrames = useRef(0);
  const perfLastUpdate = useRef(0);
  const perfCells = useRef(0);
  const perfGlow = useRef(0);
  // Cached computed style of the base <pre> — reading getComputedStyle every
  // frame forces a style recalc. Invalidated when font metrics/padding change.
  const preStyleRef = useRef<{ font: string; padLeft: number; padTop: number } | null>(null);
  const prevHolesRef = useRef<Set<number>>(new Set());
  const basePunchedRef = useRef(false);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const glRendererRef = useRef<GlSceneRenderer | null>(null);
  const baseCodesRef = useRef<Uint32Array | null>(null);

  // Restore auto-saved scene on mount
  useEffect(() => {
    // Check for shared scene by ID
    try {
      const hash = window.location.hash;
      if (hash.startsWith("#shared=")) {
        const id = hash.slice(8);
        window.history.replaceState(null, "", window.location.pathname);
        fetch(`/api/scenes/${id}`)
          .then(r => r.json())
          .then(data => {
            if (data.scene) {
              useEditorStore.getState().setScene(data.scene);
              if (data.scene.image?.data) useEditorStore.getState().setImageUrl(data.scene.image.data);
            }
          })
          .catch(() => { /* failed to load shared scene */ });
        return;
      }
    } catch { /* ignore */ }

    // Check for shared scene in URL hash
    try {
      const hash = window.location.hash;
      if (hash.startsWith("#scene=")) {
        const encoded = hash.slice(7);
        const json = decodeURIComponent(escape(atob(encoded)));
        const data = JSON.parse(json);
        if (data.version) {
          useEditorStore.getState().setScene(data);
          if (data.image?.data) useEditorStore.getState().setImageUrl(data.image.data);
          window.history.replaceState(null, "", window.location.pathname);
          return; // Skip localStorage restore
        }
      }
    } catch { /* invalid hash — ignore */ }

    // Fall back to IndexedDB/localStorage restore
    loadState().then((data) => {
      if (!data) return;
      const store = useEditorStore.getState();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (data.scene) store.setScene(data.scene as any);
      if (data.imageUrl) store.setImageUrl(data.imageUrl);
      if (data.maskData && data.maskWidth) {
        Mask.fromBase64(data.maskData, data.maskWidth, data.maskHeight).then((restored) => {
          useEditorStore.getState().setMask(restored);
        }).catch(() => { /* corrupt mask data — ignore */ });
      }
    }).catch(() => { /* storage unavailable */ });
  }, []);

  // Feed base text to text-dependent effects
  function feedBaseText(effects: ActiveEffect[], text: string) {
    for (const fx of effects) {
      const inst = fx.instance;
      if ("setBaseText" in inst && typeof (inst as TypewriterEffect | DecodeEffect).setBaseText === "function") {
        (inst as TypewriterEffect | DecodeEffect).setBaseText(text);
      }
    }
  }

  // Rebuild effects when scene effects change
  useEffect(() => {
    const configs = sceneEffects;
    const prev = effectsRef.current;

    // Check if we can reuse existing instances (same types in same order)
    const canReuse = prev.length === configs.length &&
      configs.every((cfg, i) => prev[i] && prev[i].instance.type === cfg.type);

    if (canReuse) {
      // Update params — effects handle init() gracefully (only reset on structural changes)
      effectsRef.current = configs.map((cfg, i) => {
        const existing = prev[i];
        if (grid.cols > 0) existing.instance.init(grid, withSeed(cfg.params, sceneSeed, i));
        return {
          ...existing,
          maskRegion: cfg.maskRegion,
          enabled: cfg.enabled,
          timelineStart: cfg.timeline.start,
          timelineEnd: cfg.timeline.end,
          mode: cfg.timeline.mode ?? "continuous",
          applyToAscii: cfg.applyToAscii ?? false,
        };
      });
    } else {
      // Types changed — recreate all instances
      effectsRef.current = configs.map((cfg, i) => {
        const instance = createEffect(cfg.type);
        if (grid.cols > 0) instance.init(grid, withSeed(cfg.params, sceneSeed, i));
        return {
          instance,
          maskRegion: cfg.maskRegion,
          enabled: cfg.enabled,
          timelineStart: cfg.timeline.start,
          timelineEnd: cfg.timeline.end,
          mode: cfg.timeline.mode ?? "continuous",
          applyToAscii: cfg.applyToAscii ?? false,
        };
      });
    }
    if (asciiTextRef.current) {
      feedBaseText(effectsRef.current, asciiTextRef.current);
    }
  }, [sceneEffects, sceneSeed, grid]);

  const computeContainRect = useCallback(() => {
    const container = containerRef.current;
    if (!container || !imgRef.current) return;
    const vp = container.getBoundingClientRect();
    const imgW = imgRef.current.naturalWidth;
    const imgH = imgRef.current.naturalHeight;
    if (imgW === 0 || imgH === 0 || vp.width === 0 || vp.height === 0) return;
    const imgAspect = imgW / imgH;
    const vpAspect = vp.width / vp.height;

    let w, h;
    if (imgAspect > vpAspect) {
      w = vp.width;
      h = vp.width / imgAspect;
    } else {
      h = vp.height;
      w = vp.height * imgAspect;
    }

    const x = (vp.width - w) / 2;
    const y = (vp.height - h) / 2;
    setDisplayRect({ x, y, w, h });
  }, []);

  const regenerate = useCallback(() => {
    const img = imgRef.current;
    const pre = asciiRef.current;
    if (!img || !pre) return;

    // Reset padding before measuring so previous centering padding doesn't shrink the grid
    pre.style.padding = "0";

    const g = measureGrid(pre);
    setGrid(g);

    // Center the grid within the container by applying remainder padding
    pre.style.padding = `${g.padY}px ${g.padX}px`;
    preStyleRef.current = null; // font/padding changed — re-read on next frame

    const text = imageToAscii(img, g, { ramp: asciiRamp });
    pre.textContent = text;
    asciiTextRef.current = text;
    basePunchedRef.current = false;
    prevHolesRef.current = new Set();

    feedBaseText(effectsRef.current, text);
  }, [asciiRamp]);

  // Load image
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    // Only set crossOrigin for remote URLs — data URLs don't need it and it can cause issues
    if (!imageUrl.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onerror = () => {
      console.warn("Failed to load image:", imageUrl.slice(0, 100));
    };
    img.onload = () => {
      imgRef.current = img;
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });

      // Initialize mask if needed
      const store = useEditorStore.getState();
      if (!store.mask || store.mask.width !== img.naturalWidth || store.mask.height !== img.naturalHeight) {
        initMask(img.naturalWidth, img.naturalHeight);
      }

      if (bgRef.current) {
        bgRef.current.style.backgroundImage = `url("${imageUrl}")`;
        const [r, g, b] = sampleMeanColor(img);
        bgRef.current.style.backgroundColor = `rgb(${(r * 0.5) | 0}, ${(g * 0.5) | 0}, ${(b * 0.5) | 0})`;
      }

      computeContainRect();
      regenerate();
    };
    img.src = imageUrl;
    // computeContainRect/regenerate/initMask are stable per render and only run
    // inside onload; re-running this effect for them would re-load the image.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      computeContainRect();
      regenerate();
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [computeContainRect, regenerate]);

  // Re-generate ASCII when display rect changes (after computeContainRect commits)
  useEffect(() => {
    if (displayRect.w > 0 && displayRect.h > 0 && imgRef.current) {
      regenerate();
    }
  }, [displayRect, regenerate]);

  // Re-render when fonts load (prevents mismatched layers)
  useEffect(() => {
    document.fonts.ready.then(() => {
      preStyleRef.current = null; // Force canvas font refresh
      regenerate();
    });
  }, [regenerate]);

  // Apply ASCII visual styles via store subscription + refs (bypasses React re-renders).
  // useLayoutEffect so it runs synchronously before regenerate() ever measures the pre.
  // imageUrl in deps: the pre only exists when imageUrl is set, so we need to re-run
  // this effect after the pre is mounted to set its initial inline styles.
  useLayoutEffect(() => {
    function apply(ascii: ReturnType<typeof useEditorStore.getState>["scene"]["ascii"]) {
      const a = asciiRef.current;
      if (a) {
        a.style.color = ascii.color;
        a.style.opacity = String(ascii.opacity);
        // Blend mode applies to the static ASCII pre only — it blends with the bg image below
        a.style.mixBlendMode = ascii.blendMode;
        // fontSize is stored as a CSS string (e.g. "11px" or "0.85vw") — use raw
        a.style.fontSize = ascii.fontSize;
        a.style.lineHeight = String(ascii.lineHeight);
        a.style.letterSpacing = ascii.letterSpacing;
      }
      preStyleRef.current = null; // styles changed — re-read on next frame
    }
    // Apply whenever the pre is (re)mounted
    apply(useEditorStore.getState().scene.ascii);
    // Subscribe to future changes without causing Canvas re-renders
    return useEditorStore.subscribe((state, prev) => {
      if (state.scene.ascii !== prev.scene.ascii) {
        const oldA = prev.scene.ascii;
        const newA = state.scene.ascii;
        apply(newA);
        // If font metrics changed, re-measure grid and regenerate ASCII text
        if (newA.fontSize !== oldA.fontSize || newA.lineHeight !== oldA.lineHeight || newA.letterSpacing !== oldA.letterSpacing) {
          // Defer regenerate to next frame so the inline styles are applied first
          requestAnimationFrame(() => {
            const img = imgRef.current;
            const pre = asciiRef.current;
            if (img && pre) {
              // Reset centering padding before measuring
              pre.style.padding = "0";
              const g = measureGrid(pre);
              setGrid(g);
              // Re-apply centering padding
              pre.style.padding = `${g.padY}px ${g.padX}px`;
              preStyleRef.current = null;
              const text = imageToAscii(img, g, { ramp: useEditorStore.getState().scene.ascii.ramp });
              pre.textContent = text;
              asciiTextRef.current = text;
              basePunchedRef.current = false;
              prevHolesRef.current = new Set();
              feedBaseText(effectsRef.current, text);
            }
          });
        }
      }
    });
  }, [imageUrl]);

  // GL renderer lifecycle: create/dispose with the toggle; keep font,
  // backdrop, viewport, and scene options in sync.
  useEffect(() => {
    if (!useGl) {
      glRendererRef.current?.dispose();
      glRendererRef.current = null;
      return;
    }
    const canvas = glCanvasRef.current;
    if (!canvas) return;
    try {
      glRendererRef.current = new GlSceneRenderer(canvas);
    } catch (err) {
      console.warn("[txtfx] WebGL2 unavailable, staying on 2D renderer:", err);
      setUseGl(false);
      return;
    }
    return () => {
      glRendererRef.current?.dispose();
      glRendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useGl, imageUrl]);

  // Sync GL inputs whenever layout/scene knobs change
  useEffect(() => {
    const renderer = glRendererRef.current;
    if (!useGl || !renderer) return;
    if (displayRect.w > 0) renderer.setViewport(displayRect.w, displayRect.h, window.devicePixelRatio || 1);
    if (grid.cols > 0 && asciiRef.current) {
      const family = getComputedStyle(asciiRef.current).fontFamily || "monospace";
      renderer.setFont({
        fontSize: grid.fontSize,
        fontFamily: family,
        charW: grid.charW,
        charH: grid.charH,
        dpr: window.devicePixelRatio || 1,
      });
      baseCodesRef.current = textToCodes(asciiTextRef.current, grid.cols, grid.rows);
    }
    if (imgRef.current) renderer.setBackdrop(showImage ? imgRef.current : null);
    const ascii = useEditorStore.getState().scene.ascii;
    const parsed = parseColor(ascii.color) ?? [220, 230, 255, 0.38];
    renderer.setSceneOptions({
      baseColor: packRGB(parsed[0], parsed[1], parsed[2]),
      baseAlpha: showAscii ? parsed[3] * (ascii.opacity ?? 1) : 0,
      blendMode: ascii.blendMode || "screen",
    });
  });

  function renderGlFrame(buffers: NonNullable<ReturnType<typeof compositeFrame>["buffers"]>) {
    const renderer = glRendererRef.current;
    if (!renderer || !baseCodesRef.current) return;
    if (renderer.isContextLost()) return;
    renderer.renderFrame({
      grid,
      baseCodes: baseCodesRef.current,
      composite: buffers,
      showEffects,
    });
  }

  /** One frame through whichever renderer is active. */
  function renderComposite(dt: number, now: number) {
    const currentMask = maskGridRef.current;
    if (useGl && glRendererRef.current) {
      const result = compositeFrame(effectsRef.current, dt, now, currentMask, grid, asciiTextRef.current, {
        buildText: false,
        exposeBuffers: true,
      });
      perfCells.current = result.glowCount;
      if (result.buffers) renderGlFrame(result.buffers);
      return;
    }
    const result = compositeFrame(effectsRef.current, dt, now, currentMask, grid, asciiTextRef.current, { buildText: false });
    perfCells.current = result.glowCount;
    renderGlow(result.glowCells, result.glowCount);
  }

  // (Re)build the mask grid on structural changes (clear, undo, restore,
  // grid/image resize). Brush strokes update it incrementally in paintStroke
  // and only bump maskVersion at stroke END — the full O(image) rebuild per
  // pointermove was what made painting on large images laggy.
  useEffect(() => {
    const m = useEditorStore.getState().mask;
    if (m && grid.cols > 0 && imgSize.w > 0) {
      incrementalMaskRef.current = m.createIncrementalGrid(grid, imgSize.w, imgSize.h);
      maskGridRef.current = incrementalMaskRef.current;
    }
  }, [maskVersion, grid, imgSize]);

  // Draw mask overlay. With a region: regenerate only the display pixels the
  // brush touched (full-canvas regeneration per pointermove was O(pixels)).
  const redrawMaskOverlay = useCallback((region?: MaskDirtyRect) => {
    const canvas = maskOverlayRef.current;
    if (!canvas) return;
    if (displayRect.w === 0 || displayRect.h === 0) return;

    if (canvas.width !== displayRect.w || canvas.height !== displayRect.h) {
      canvas.width = displayRect.w;
      canvas.height = displayRect.h;
      region = undefined; // resize cleared the canvas — full redraw
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const m = useEditorStore.getState().mask;
    if (!m) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const scaleX = m.width / canvas.width;
    const scaleY = m.height / canvas.height;

    // Display-pixel bounds to regenerate (whole canvas without a region)
    let dx0 = 0, dy0 = 0, dx1 = canvas.width - 1, dy1 = canvas.height - 1;
    if (region) {
      dx0 = Math.max(0, Math.floor(region.x0 / scaleX) - 1);
      dx1 = Math.min(canvas.width - 1, Math.ceil((region.x1 + 1) / scaleX) + 1);
      dy0 = Math.max(0, Math.floor(region.y0 / scaleY) - 1);
      dy1 = Math.min(canvas.height - 1, Math.ceil((region.y1 + 1) / scaleY) + 1);
      if (dx0 > dx1 || dy0 > dy1) return;
    }
    const w = dx1 - dx0 + 1;
    const h = dy1 - dy0 + 1;

    const imgData = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const mx = Math.floor((x + dx0) * scaleX);
        const my = Math.floor((y + dy0) * scaleY);
        const val = m.get(mx, my);
        const idx = (y * w + x) * 4;
        if (val < 128) {
          // Foreground - tint green
          imgData.data[idx] = 125;
          imgData.data[idx + 1] = 239;
          imgData.data[idx + 2] = 160;
          imgData.data[idx + 3] = Math.floor((1 - val / 128) * 80);
        } else {
          imgData.data[idx] = 0;
          imgData.data[idx + 1] = 0;
          imgData.data[idx + 2] = 0;
          imgData.data[idx + 3] = 0;
        }
      }
    }
    ctx.putImageData(imgData, dx0, dy0);
  }, [displayRect]);

  // Full overlay redraw on structural changes (toggle, stroke end, resize)
  useEffect(() => {
    redrawMaskOverlay();
  }, [showMask, maskVersion, displayRect, redrawMaskOverlay]);

  // Fast-forward effects from time 0 to targetTime by simulating in steps
  function simulateToTime(targetTime: number) {
    // Read CURRENT configs from store, not from stale closure.
    // The animation loop's tick() captures this function from an old render,
    // so sceneEffects might be outdated if the user changed params during playback.
    const state = useEditorStore.getState();
    const configs = state.scene.effects;
    // Re-init with current params, then reset to the exact seeded t=0 state —
    // the subsequent fixed-step replay is fully deterministic, so scrubbing
    // to the same time always shows the same frame.
    for (let i = 0; i < effectsRef.current.length && i < configs.length; i++) {
      effectsRef.current[i].instance.init(grid, withSeed(configs[i].params, state.scene.seed, i));
      effectsRef.current[i].instance.reset();
    }
    if (asciiTextRef.current) {
      feedBaseText(effectsRef.current, asciiTextRef.current);
    }

    // Simulate forward in fixed timesteps
    const step = Math.max(1 / 30, targetTime / 60); // At most 60 steps
    const mask = maskGridRef.current;
    let t = 0;
    while (t < targetTime) {
      const dt = Math.min(step, targetTime - t);
      compositeFrame(effectsRef.current, dt, t, mask, grid, asciiTextRef.current, { buildText: false });
      t += dt;
    }
  }

  function getEffectLayout(): EffectCanvasLayout | null {
    const pre = asciiRef.current;
    if (!pre) return null;
    if (!preStyleRef.current) {
      const style = getComputedStyle(pre);
      preStyleRef.current = {
        font: style.font || `${grid.fontSize}px monospace`,
        padLeft: parseFloat(style.paddingLeft) || 0,
        padTop: parseFloat(style.paddingTop) || 0,
      };
    }
    const cached = preStyleRef.current;
    return {
      padLeft: cached.padLeft,
      padTop: cached.padTop,
      charW: grid.charW,
      charH: grid.charH,
      font: cached.font,
    };
  }

  function renderGlow(glowCells: GlowCell[], count: number) {
    const canvas = glowCanvasRef.current;
    if (!canvas) return;
    if (displayRect.w === 0 || displayRect.h === 0) return;
    const pre = asciiRef.current;

    const dpr = window.devicePixelRatio || 1;
    const w = displayRect.w;
    const h = displayRect.h;
    const newW = w * dpr;
    const newH = h * dpr;
    if (canvas.width !== newW || canvas.height !== newH) {
      canvas.width = newW;
      canvas.height = newH;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // applyToAscii cells punch holes in the base <pre>. Diffed: the DOM is
    // only touched on frames where the hole set actually changed.
    const holes = showEffects ? collectHoles(glowCells, count, grid.cols) : new Set<number>();
    if (holesChanged(prevHolesRef.current, holes)) {
      prevHolesRef.current = holes;
      if (pre && asciiTextRef.current) {
        if (holes.size > 0) {
          pre.textContent = punchHoles(asciiTextRef.current.split("\n"), holes, grid.cols, grid.rows);
          basePunchedRef.current = true;
        } else if (basePunchedRef.current) {
          pre.textContent = asciiTextRef.current;
          basePunchedRef.current = false;
        }
      }
    }

    if (count === 0 || !showEffects) return;

    // All effect glyphs render on the canvas (same as the export pipeline) —
    // the old per-cell <span> + text-shadow DOM overlay was the editor's
    // single largest frame cost.
    const layout = getEffectLayout();
    if (layout) drawEffectCells(ctx, glowCells, count, layout);
  }

  // Animation loop
  useEffect(() => {
    if (!playing) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }
    // Respect reduced-motion: render a single static frame instead of animating
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      if (grid.cols > 0) renderComposite(0, currentTime);
      return;
    }
    wasPlayingRef.current = true;
    let isMounted = true;

    // Resume from current position without re-simulating (effects already have correct state)
    const resumeFrom = useEditorStore.getState().currentTime;
    startTimeRef.current = performance.now() - resumeFrom * 1000;
    lastTimeRef.current = resumeFrom;
    perfFrames.current = 0;
    perfLastUpdate.current = performance.now();

    const duration = playbackDuration;
    const loop = playbackLoop;
    // FPS cap: 0 means uncapped (vsync)
    const fpsInterval = playbackFps > 0 ? 1000 / playbackFps : 0;
    let lastFrameWall = performance.now();

    function tick() {
      try {
        // FPS cap — skip frame if too soon
        const wallNow = performance.now();
        if (fpsInterval > 0 && wallNow - lastFrameWall < fpsInterval) {
          animRef.current = requestAnimationFrame(tick);
          return;
        }
        // Advance by interval (not wallNow) to avoid rAF jitter drift.
        // If we fell behind by more than one interval, snap to now.
        lastFrameWall += fpsInterval;
        if (wallNow - lastFrameWall > fpsInterval) lastFrameWall = wallNow;

        const elapsed = (wallNow - startTimeRef.current) / 1000;
        let now = elapsed;
        if (loop && duration > 0) {
          now = elapsed % duration;
        }

        // Detect loop wrap and re-initialize effects
        let loopWrapped = false;
        if (now < lastTimeRef.current) {
          simulateToTime(now);
          loopWrapped = true;
        }

        if (!loop && now > duration) {
          useEditorStore.getState().setPlaying(false);
          useEditorStore.getState().setCurrentTime(duration);
          return;
        }

        const dt = loopWrapped ? 0 : Math.min(0.05, Math.abs(now - lastTimeRef.current));
        lastTimeRef.current = now;
        lastRenderedTimeRef.current = now;
        animationTime.current = now;

        if (grid.cols > 0) {
          const renderStart = performance.now();
          renderComposite(dt, now);
          perfGlow.current += performance.now() - renderStart;
        }

        // Update perf overlay (~2x/sec to avoid overhead)
        perfFrames.current++;
        const perfNow = performance.now();
        if (perfNow - perfLastUpdate.current > 500) {
          const fps = Math.round(perfFrames.current / ((perfNow - perfLastUpdate.current) / 1000));
          // render = actual simulate+draw cost; the rest of the frame interval is idle/vsync
          const renderMs = (perfGlow.current / perfFrames.current).toFixed(1);
          perfFrames.current = 0;
          perfGlow.current = 0;
          perfLastUpdate.current = perfNow;
          setPerfText(`${fps} fps · render ${renderMs}ms · ${perfCells.current} cells`);
        }
      } catch (err) {
        console.error("[txtfx] animation tick error:", err);
      }

      // ALWAYS schedule next frame, even on error, so one bad frame doesn't kill the loop
      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      // Sync store to exact last rendered time when stopping playback.
      // This runs before the paused effect, so currentTime will be accurate.
      if (isMounted) {
        setCurrentTime(lastRenderedTimeRef.current);
        animationTime.current = lastRenderedTimeRef.current;
      }
      isMounted = false;
    };
    // currentTime/simulateToTime/renderGlow/setCurrentTime are read via refs or
    // store getState inside the loop; depending on them would restart the
    // animation loop every frame and break resume-from-pause.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, grid, playbackDuration, playbackLoop, playbackFps, useGl]);

  // When scrubbing while paused or editing effects while paused, re-render.
  useEffect(() => {
    if (playing) return;
    if (grid.cols <= 0 || effectsRef.current.length === 0) return;

    // Just transitioned from playing → paused: effects already have correct state
    // from the last animation frame. Don't re-simulate. Guard subsequent renders
    // caused by the store time sync in the animation loop cleanup.
    if (wasPlayingRef.current) {
      wasPlayingRef.current = false;
      pauseGuardRef.current = 2;
      return;
    }
    if (pauseGuardRef.current > 0) {
      pauseGuardRef.current--;
      return;
    }

    // Only re-simulate if time actually changed (user scrubbed).
    // Effect-param changes (toggle applyToAscii, color tweak) should just re-render
    // at the current time without re-simulating, which would re-randomize state.
    const timeDelta = Math.abs(currentTime - lastRenderedTimeRef.current);
    if (timeDelta > 0.01) {
      simulateToTime(currentTime);
      lastRenderedTimeRef.current = currentTime;
    }

    // Re-render current state (dt=0 so no state advancement)
    renderComposite(0, currentTime);
    // renderGlow/simulateToTime are recreated each render but behaviorally
    // stable; including them would re-simulate (and re-randomize) on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, currentTime, grid, sceneEffects, useGl]);

  // Auto-play when effects are added
  useEffect(() => {
    if (sceneEffects.length > 0 && imageUrl && !playing) {
      setPlaying(true);
    }
    // Deliberately NOT depending on `playing`: this should fire only when an
    // effect is added or the image changes, not re-trigger on pause.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneEffects.length, imageUrl]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useEditorStore.getState().scene.effects.length > 0) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Mask painting
  function getMaskCoords(e: React.MouseEvent): { x: number; y: number } | null {
    const container = containerRef.current;
    if (!container || !imgRef.current) return null;
    if (displayRect.w === 0 || displayRect.h === 0) return null;
    const vpRect = container.getBoundingClientRect();
    const canvasX = vpRect.left + displayRect.x;
    const canvasY = vpRect.top + displayRect.y;
    const relX = (e.clientX - canvasX) / displayRect.w;
    const relY = (e.clientY - canvasY) / displayRect.h;
    if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;
    return {
      x: Math.floor(relX * imgSize.w),
      y: Math.floor(relY * imgSize.h),
    };
  }

  function paintStroke(x: number, y: number) {
    const m = useEditorStore.getState().mask;
    if (!m) return;
    const value = activeTool === "brush-fg" ? 0 : 255;
    const scaleX = imgSize.w / (displayRect.w || 1);
    const scaleY = imgSize.h / (displayRect.h || 1);
    const r = Math.floor(brushSize * scaleX);
    const ry = Math.floor(brushSize * scaleY);

    // Union of dirty rects from all brush stamps in this stroke segment
    let dirty: MaskDirtyRect | null = null;
    const addDirty = (rect: MaskDirtyRect | null) => {
      if (!rect) return;
      const current = dirty;
      dirty = current
        ? {
            x0: Math.min(current.x0, rect.x0),
            y0: Math.min(current.y0, rect.y0),
            x1: Math.max(current.x1, rect.x1),
            y1: Math.max(current.y1, rect.y1),
          }
        : rect;
    };

    const prev = lastPaintRef.current;
    if (prev) {
      // Bresenham line interpolation between last and current point
      const dx = Math.abs(x - prev.x);
      const dy = Math.abs(y - prev.y);
      const sx = prev.x < x ? 1 : -1;
      const sy = prev.y < y ? 1 : -1;
      let err = dx - dy;
      let cx = prev.x, cy = prev.y;
      const step = Math.max(1, Math.floor(r * 0.4)); // step by fraction of radius

      let steps = 0;
      while (true) {
        if (steps % step === 0 || (cx === x && cy === y)) {
          addDirty(m.paintBrush(cx, cy, r, value, maskFeather, ry));
        }
        if (cx === x && cy === y) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; cx += sx; }
        if (e2 < dx) { err += dx; cy += sy; }
        steps++;
        if (steps > 100000) break; // safety
      }
    } else {
      addDirty(m.paintBrush(x, y, r, value, maskFeather, ry));
    }

    lastPaintRef.current = { x, y };
    if (dirty) {
      // Incremental: only the touched grid cells + overlay pixels update.
      // maskVersion is bumped once at stroke end (handlePointerUp).
      incrementalMaskRef.current?.updateRect(dirty);
      redrawMaskOverlay(dirty);
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (activeTool === "pan") {
      e.preventDefault();
      panStartRef.current = { x: e.clientX, y: e.clientY, startPanX: panX, startPanY: panY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (activeTool !== "brush-fg" && activeTool !== "brush-bg") return;
    e.preventDefault();
    // Snapshot pre-stroke mask so undo can restore it
    pushMaskHistory();
    isPaintingRef.current = true;
    lastPaintRef.current = null;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const coords = getMaskCoords(e);
    if (coords) paintStroke(coords.x, coords.y);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    // Update brush circle position on every move (including during paint capture)
    const bc = brushCircleRef.current;
    if (bc && isBrushTool) {
      bc.style.left = `${e.clientX}px`;
      bc.style.top = `${e.clientY}px`;
      bc.style.display = "block";
    }

    if (panStartRef.current) {
      const dx = (e.clientX - panStartRef.current.x) / zoom;
      const dy = (e.clientY - panStartRef.current.y) / zoom;
      setPan(panStartRef.current.startPanX + dx, panStartRef.current.startPanY + dy);
      return;
    }
    if (!isPaintingRef.current) return;
    const coords = getMaskCoords(e);
    if (coords) paintStroke(coords.x, coords.y);
  }

  function handlePointerUp() {
    panStartRef.current = null;
    if (isPaintingRef.current) {
      // Snapshot mask state at end of stroke for undo/redo
      pushMaskHistory();
      // One version bump per stroke: triggers autosave + a consistency
      // rebuild of the mask grid (the stroke itself updated incrementally)
      bumpMaskVersion();
    }
    isPaintingRef.current = false;
    lastPaintRef.current = null;
  }

  // Drag and drop
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDraggingOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDraggingOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDraggingOver(false);

    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 20 * 1024 * 1024) { toast("Image too large (max 20MB)", "warning"); return; }
    const reader = new FileReader();
    reader.onload = () => setImageUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast("Image too large (max 20MB)", "warning"); return; }
    const reader = new FileReader();
    reader.onload = () => setImageUrl(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const isBrushTool = activeTool === "brush-fg" || activeTool === "brush-bg";
  const perfOpenState = showPerf ? "true" : "false";
  const perfDisplayText = playing ? perfText : "paused";

  // Brush circle overlay — follows pointer, no CSS cursor size limit
  const brushCircleRef = useRef<HTMLDivElement>(null);
  const brushDiameter = Math.round(brushSize * 2 * zoom);

  return (
    <main
      id="viewport"
      className="viewport"
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ cursor: activeTool === "pan" ? "grab" : isBrushTool ? "none" : undefined }}
    >
      {draggingOver && (
        <div className="drop-overlay">
          <UploadSimple size={48} weight="thin" />
          <div className="drop-overlay-text">Drop image here</div>
        </div>
      )}

      {!imageUrl ? (
        <div className="upload-overlay" onClick={() => fileRef.current?.click()}>
          <ImageSquare size={48} weight="thin" className="upload-overlay-icon" />
          <div className="upload-overlay-text">
            Click or drag an image to get started
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFileInput} />
        </div>
      ) : (
        <div
          className="viewport-canvas"
          style={{
            position: "absolute",
            left: displayRect.x,
            top: displayRect.y,
            width: displayRect.w,
            height: displayRect.h,
            transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`,
            transformOrigin: "center center",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            const bc = brushCircleRef.current;
            if (bc) bc.style.display = "none";
          }}
        >
          <div
            ref={bgRef}
            className="hero-bg"
            style={{
              position: "absolute",
              inset: 0,
              backgroundSize: "100% 100%",
              backgroundPosition: "center",
              transform: "scale(1.03)",
              opacity: 0.86,
              visibility: showImage && !useGl ? "visible" : "hidden",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `
                radial-gradient(at left top, rgba(0,0,0,0.45), transparent 50%),
                radial-gradient(at right top, rgba(0,0,0,0.45), transparent 50%),
                radial-gradient(at left bottom, rgba(0,0,0,0.45), transparent 50%),
                radial-gradient(at right bottom, rgba(0,0,0,0.45), transparent 50%)
              `,
            }}
          />
          <pre
            ref={asciiRef}
            className="ascii-overlay"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 2,
              visibility: showAscii && !useGl ? "visible" : "hidden",
            }}
          />
          <canvas
            ref={glowCanvasRef}
            className="ascii-glow"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              zIndex: 4,
              pointerEvents: "none",
              visibility: showEffects && !useGl ? "visible" : "hidden",
            }}
          />
          <canvas
            ref={glCanvasRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              zIndex: 2,
              pointerEvents: "none",
              visibility: useGl ? "visible" : "hidden",
            }}
          />
          <canvas
            ref={maskOverlayRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              zIndex: 5,
              pointerEvents: "none",
              visibility: showMask ? "visible" : "hidden",
            }}
          />
        </div>
      )}

      {imageUrl && (
        <div className="viewport-info">
          <button className="zoom-btn" onClick={() => setZoom(zoom - 0.25)} title="Zoom out"><Minus size={10} /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="zoom-btn" onClick={() => setZoom(zoom + 0.25)} title="Zoom in"><Plus size={10} /></button>
          {(zoom !== 1 || panX !== 0 || panY !== 0) && (
            <button className="zoom-btn" onClick={() => { setZoom(1); setPan(0, 0); }} title="Reset view"><ArrowCounterClockwise size={10} /></button>
          )}
          <span className="viewport-info-sep">|</span>
          <span>{imgSize.w} x {imgSize.h}</span>
          <span className="viewport-info-sep">|</span>
          <span>{grid.cols} x {grid.rows} chars</span>
        </div>
      )}
      <div className="perf-hud-wrap">
        <div
          className="perf-hud perf-hud--chip"
          data-open={perfOpenState}
        >
          <button
            className="perf-toggle-btn"
            onClick={() => setShowPerf((v) => !v)}
            title="Toggle perf overlay"
            aria-label="Toggle perf overlay"
            aria-pressed={showPerf}
          >
            <ChartLine size={13} />
          </button>
          <button
            className="perf-toggle-btn"
            onClick={() => setUseGl((v) => !v)}
            title={useGl ? "Switch to 2D renderer" : "Switch to WebGL renderer"}
            aria-pressed={useGl}
            style={{ fontSize: 9, fontWeight: 700, color: useGl ? "var(--accent, #7defa0)" : undefined }}
          >
            GL
          </button>
          <div
            className="perf-panel-clip"
            aria-hidden={!showPerf}
          >
            <div className="perf-overlay">{perfDisplayText}</div>
          </div>
        </div>
      </div>
      {isBrushTool && (
        <div
          ref={brushCircleRef}
          className="brush-circle"
          style={{
            width: brushDiameter,
            height: brushDiameter,
          }}
        />
      )}
    </main>
  );
}
