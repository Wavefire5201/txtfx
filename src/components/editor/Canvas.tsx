"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useEditorStore, animationTime } from "@/lib/store";
import { loadState } from "@/lib/cache";
import { Mask } from "@/engine/mask";
import { measureGrid, imageToAscii, sampleMeanColor } from "@/engine/ascii";
import { createEffect } from "@/engine/effects";
import { compositeFrame, type ActiveEffect, type GlowCell } from "@/engine/renderer";
import { getGlowSprite } from "@/engine/glow-cache";
import type { GridInfo, MaskGrid } from "@/engine/effects/types";
import { ImageSquare, UploadSimple, ChartLine, Minus, Plus, ArrowCounterClockwise } from "@phosphor-icons/react";
import { toast } from "./Toast";
import type { TypewriterEffect } from "@/engine/effects/typewriter";
import type { DecodeEffect } from "@/engine/effects/decode";

const EMPTY_MASK: MaskGrid = { get: () => 1 };

export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const asciiRef = useRef<HTMLPreElement>(null);
  const effectPreRef = useRef<HTMLPreElement>(null);
  const glowCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskOverlayRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const imageUrl = useEditorStore((s) => s.imageUrl);
  const setImageUrl = useEditorStore((s) => s.setImageUrl);
  const scene = useEditorStore((s) => s.scene);
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
  const [perfText, setPerfText] = useState("0 fps · 0.0ms · 0 cells · 0 glow");

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
  const wasPlayingRef = useRef(false);
  const pauseGuardRef = useRef(0);
  const perfFrames = useRef(0);
  const perfLastUpdate = useRef(0);
  const perfCells = useRef(0);
  const perfGlow = useRef(0);
  const lastFontRef = useRef("");

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
  }, [imageUrl]);

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
    const configs = scene.effects;
    const prev = effectsRef.current;

    // Check if we can reuse existing instances (same types in same order)
    const canReuse = prev.length === configs.length &&
      configs.every((cfg, i) => prev[i] && prev[i].instance.type === cfg.type);

    if (canReuse) {
      // Update params — effects handle init() gracefully (only reset on structural changes)
      effectsRef.current = configs.map((cfg, i) => {
        const existing = prev[i];
        if (grid.cols > 0) existing.instance.init(grid, cfg.params);
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
      effectsRef.current = configs.map((cfg) => {
        const instance = createEffect(cfg.type);
        if (grid.cols > 0) instance.init(grid, cfg.params);
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
  }, [scene.effects, grid]);

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

    const g = measureGrid(pre);
    setGrid(g); // grid change triggers effects useEffect which handles init()

    const text = imageToAscii(img, g, { ramp: scene.ascii.ramp });
    pre.textContent = text;
    asciiTextRef.current = text;

    feedBaseText(effectsRef.current, text);
  }, [scene.ascii.ramp]);

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
      lastFontRef.current = ""; // Force canvas font refresh
      regenerate();
    });
  }, [regenerate]);

  // Build mask grid when mask changes
  useEffect(() => {
    const m = useEditorStore.getState().mask;
    if (m && grid.cols > 0 && imgSize.w > 0) {
      maskGridRef.current = m.toGrid(grid, imgSize.w, imgSize.h);
    }
  }, [maskVersion, grid, imgSize]);

  // Draw mask overlay (always update so toggling visibility is instant)
  useEffect(() => {
    if (!maskOverlayRef.current) return;
    const canvas = maskOverlayRef.current;
    if (displayRect.w === 0 || displayRect.h === 0) return;

    canvas.width = displayRect.w;
    canvas.height = displayRect.h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const m = useEditorStore.getState().mask;
    if (!m) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const imgData = ctx.createImageData(canvas.width, canvas.height);
    const scaleX = m.width / canvas.width;
    const scaleY = m.height / canvas.height;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const mx = Math.floor(x * scaleX);
        const my = Math.floor(y * scaleY);
        const val = m.get(mx, my);
        const idx = (y * canvas.width + x) * 4;
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
    ctx.putImageData(imgData, 0, 0);
  }, [showMask, maskVersion, displayRect]);

  // Fast-forward effects from time 0 to targetTime by simulating in steps
  function simulateToTime(targetTime: number) {
    const configs = scene.effects;
    // Re-init all effects from scratch
    for (let i = 0; i < effectsRef.current.length && i < configs.length; i++) {
      effectsRef.current[i].instance.init(grid, configs[i].params);
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
      compositeFrame(effectsRef.current, dt, t, mask, grid, asciiTextRef.current);
      t += dt;
    }
  }

  function renderGlow(glowCells: GlowCell[], count: number) {
    const canvas = glowCanvasRef.current;
    if (!canvas) return;
    if (displayRect.w === 0 || displayRect.h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = displayRect.w;
    const h = displayRect.h;

    const newW = w * dpr;
    const newH = h * dpr;
    const needsResize = canvas.width !== newW || canvas.height !== newH;
    if (needsResize) {
      canvas.width = newW;
      canvas.height = newH;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (needsResize) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.clearRect(0, 0, w, h);

    const effectPre = effectPreRef.current;
    const pre = asciiRef.current;

    if (count === 0) {
      if (effectPre) effectPre.textContent = "";
      // Restore base text (undo any holes punched by previous frames)
      if (pre && asciiTextRef.current) pre.textContent = asciiTextRef.current;
      return;
    }

    const preStyle = pre ? getComputedStyle(pre) : null;
    const computedFont = pre ? preStyle!.font : `${grid.fontSize}px monospace`;
    if (computedFont !== lastFontRef.current) {
      ctx.font = computedFont;
      lastFontRef.current = computedFont;
    }
    ctx.textBaseline = "top";
    const padLeft = preStyle ? parseFloat(preStyle.paddingLeft) || 0 : 8;
    const padTop = preStyle ? parseFloat(preStyle.paddingTop) || 0 : 10;

    let prevHex = "";
    let cR = 0, cG = 0, cB = 0;

    // Separate cells: asciiOverlay → DOM pre, regular → canvas fillText
    const { cols, rows: gridRows } = grid;
    const overlayGrid = new Map<number, Map<number, { char: string; color: string; brightness: number }>>();
    let hasOverlay = false;

    // Canvas pass 1: glow sprites for ALL cells
    for (let i = 0; i < count; i++) {
      const cell = glowCells[i];
      const gr = cell.glowRadius ?? 18;

      if (gr > 0) {
        const cx = padLeft + cell.col * grid.charW + grid.charW * 0.5;
        const cy = padTop + cell.row * grid.charH + grid.charH * 0.5;
        if (cell.color !== prevHex) {
          prevHex = cell.color;
          cR = parseInt(cell.color.slice(1, 3), 16) || 0;
          cG = parseInt(cell.color.slice(3, 5), 16) || 0;
          cB = parseInt(cell.color.slice(5, 7), 16) || 0;
        }
        const sprite = getGlowSprite(cR, cG, cB, gr, cell.brightness);
        ctx.drawImage(sprite, cx - gr, cy - gr, gr * 2, gr * 2);
      }

      // asciiOverlay cells → DOM overlay (pixel-perfect alignment with base text)
      // regular cells → canvas fillText (good enough for glowing effect chars)
      if (cell.asciiOverlay) {
        let rowMap = overlayGrid.get(cell.row);
        if (!rowMap) { rowMap = new Map(); overlayGrid.set(cell.row, rowMap); }
        const existing = rowMap.get(cell.col);
        if (!existing || cell.brightness > existing.brightness) {
          rowMap.set(cell.col, { char: cell.char, color: cell.color, brightness: cell.brightness });
          hasOverlay = true;
        }
      }
    }

    // DOM overlay: ALL effect characters in a <pre> for pixel-perfect alignment.
    // Only asciiOverlay cells punch holes in base text. Skip when hidden.
    if (!effectPre || !showEffects) {
      if (effectPre) effectPre.textContent = "";
      if (pre && asciiTextRef.current) pre.textContent = asciiTextRef.current;
      return;
    }

    // Collect regular (non-asciiOverlay) cells into the overlay grid too
    // Track asciiOverlay positions separately for hole-punching
    const holeSet = new Set<number>(); // row * cols + col
    for (let i = 0; i < count; i++) {
      const cell = glowCells[i];
      if (cell.asciiOverlay) {
        holeSet.add(cell.row * cols + cell.col);
        continue; // already in overlayGrid
      }
      let rowMap = overlayGrid.get(cell.row);
      if (!rowMap) { rowMap = new Map(); overlayGrid.set(cell.row, rowMap); }
      const existing = rowMap.get(cell.col);
      if (!existing || cell.brightness > existing.brightness) {
        rowMap.set(cell.col, { char: cell.char, color: cell.color, brightness: cell.brightness });
        hasOverlay = true;
      }
    }

    if (!hasOverlay) {
      effectPre.textContent = "";
      if (pre && asciiTextRef.current) pre.textContent = asciiTextRef.current;
      return;
    }

    function safeColor(c: string): string {
      return c.replace(/[^a-fA-F0-9#(),.\s%a-z]/g, "");
    }

    // Build effect HTML — batch spaces, only span for active cells
    const baseLines = asciiTextRef.current.split("\n");
    const effectParts: string[] = [];
    const emptyRow = " ".repeat(cols);

    for (let r = 0; r < gridRows; r++) {
      if (r > 0) effectParts.push("\n");
      const rowMap = overlayGrid.get(r);
      if (!rowMap) { effectParts.push(emptyRow); continue; }
      const entries = Array.from(rowMap.entries()).sort((a, b) => a[0] - b[0]);
      let c = 0;
      for (const [col, cell] of entries) {
        if (col > c) effectParts.push(" ".repeat(col - c));
        c = col + 1;
        const a = Math.min(1, cell.brightness * 0.95).toFixed(2);
        const ch = cell.char === "<" ? "&lt;" : cell.char === "&" ? "&amp;" : cell.char;
        const sc = safeColor(cell.color);
        effectParts.push(`<span style="color:${sc};opacity:${a};text-shadow:0 0 8px ${sc},0 0 16px ${sc}">${ch}</span>`);
      }
      if (c < cols) effectParts.push(" ".repeat(cols - c));
    }
    effectPre.innerHTML = effectParts.join("");

    // Hole-punch base text only at asciiOverlay positions
    if (holeSet.size > 0 && pre) {
      const baseParts: string[] = [];
      for (let r = 0; r < gridRows; r++) {
        if (r > 0) baseParts.push("\n");
        const baseLine = baseLines[r] || "";
        let rowHasHoles = false;
        for (let c = 0; c < cols; c++) {
          if (holeSet.has(r * cols + c)) { rowHasHoles = true; break; }
        }
        if (!rowHasHoles) {
          baseParts.push(baseLine.padEnd(cols, " ").slice(0, cols));
        } else {
          for (let c = 0; c < cols; c++) {
            baseParts.push(holeSet.has(r * cols + c) ? " " : (baseLine[c] || " "));
          }
        }
      }
      pre.textContent = baseParts.join("");
    } else if (pre && asciiTextRef.current) {
      pre.textContent = asciiTextRef.current;
    }
  }

  // Animation loop
  useEffect(() => {
    if (!playing) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
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

    const duration = scene.playback.duration;
    const loop = scene.playback.loop;

    function tick() {
      const elapsed = (performance.now() - startTimeRef.current) / 1000;
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

      // After loop wrap, simulateToTime already brought effects to `now`,
      // so use dt=0 to avoid double-advancing.
      const dt = loopWrapped ? 0 : Math.min(0.05, Math.abs(now - lastTimeRef.current));
      lastTimeRef.current = now;
      lastRenderedTimeRef.current = now;
      animationTime.current = now; // 60fps — read by Timeline for smooth playhead

      if (grid.cols > 0) {
        const currentMask = maskGridRef.current;
        const result = compositeFrame(effectsRef.current, dt, now, currentMask, grid, asciiTextRef.current);
        perfCells.current = result.glowCount;
        renderGlow(result.glowCells, result.glowCount);
        perfGlow.current = result.glowCount;
      }

      // Update perf overlay (~2x/sec to avoid overhead)
      perfFrames.current++;
      const perfNow = performance.now();
      if (perfNow - perfLastUpdate.current > 500) {
        const fps = Math.round(perfFrames.current / ((perfNow - perfLastUpdate.current) / 1000));
        const frameMs = ((perfNow - perfLastUpdate.current) / perfFrames.current).toFixed(1);
        perfFrames.current = 0;
        perfLastUpdate.current = perfNow;
        setPerfText(`${fps} fps · ${frameMs}ms · ${perfCells.current} cells · ${perfGlow.current} glow`);
      }

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
  }, [playing, grid, scene.playback.duration, scene.playback.loop]);

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

    // User is scrubbing while paused — re-simulate to the new time
    simulateToTime(currentTime);
    const currentMask = maskGridRef.current;
    const result = compositeFrame(effectsRef.current, 0, currentTime, currentMask, grid, asciiTextRef.current);
    renderGlow(result.glowCells, result.glowCount);
    lastRenderedTimeRef.current = currentTime;
  }, [playing, currentTime, grid, scene.effects]);

  // Auto-play when effects are added
  useEffect(() => {
    if (scene.effects.length > 0 && imageUrl && !playing) {
      setPlaying(true);
    }
  }, [scene.effects.length, imageUrl]);

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

    const prev = lastPaintRef.current;
    if (prev) {
      // Bresenham line interpolation between last and current point
      let dx = Math.abs(x - prev.x);
      let dy = Math.abs(y - prev.y);
      const sx = prev.x < x ? 1 : -1;
      const sy = prev.y < y ? 1 : -1;
      let err = dx - dy;
      let cx = prev.x, cy = prev.y;
      const step = Math.max(1, Math.floor(r * 0.4)); // step by fraction of radius

      let steps = 0;
      while (true) {
        if (steps % step === 0 || (cx === x && cy === y)) {
          m.paintBrush(cx, cy, r, value, maskFeather, ry);
        }
        if (cx === x && cy === y) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; cx += sx; }
        if (e2 < dx) { err += dx; cy += sy; }
        steps++;
        if (steps > 100000) break; // safety
      }
    } else {
      m.paintBrush(x, y, r, value, maskFeather, ry);
    }

    lastPaintRef.current = { x, y };
    bumpMaskVersion();
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
    isPaintingRef.current = true;
    lastPaintRef.current = null;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const coords = getMaskCoords(e);
    if (coords) paintStroke(coords.x, coords.y);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
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

  const fontSize = scene.ascii.fontSize;

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast("Image too large (max 20MB)", "warning"); return; }
    const reader = new FileReader();
    reader.onload = () => setImageUrl(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const preStyle: React.CSSProperties = {
    fontSize,
    lineHeight: scene.ascii.lineHeight,
    letterSpacing: scene.ascii.letterSpacing,
  };

  const isBrushTool = activeTool === "brush-fg" || activeTool === "brush-bg";
  const perfOpenState = showPerf ? "true" : "false";
  const perfDisplayText = playing ? perfText : "paused";

  const brushCursor = (() => {
    if (!isBrushTool) return undefined;
    const maxSize = 64;
    // The brush paints in image-space with radius = brushSize * (imgSize / displayRect).
    // The cursor must show the visual size on screen, which is brushSize scaled by
    // the ratio of display size to image size, then multiplied by zoom.
    // paintStroke radius in image px = brushSize * (imgSize.w / displayRect.w)
    // That radius on screen = radius / (imgSize.w / displayRect.w) = brushSize
    // So brushSize IS already the visual radius in CSS px (before zoom).
    // But the cursor is outside the zoom transform, so multiply by zoom.
    const visualDiameter = Math.min(Math.round(brushSize * 2 * zoom), maxSize);
    const size = Math.max(4, visualDiameter);
    const r = Math.max(1, size / 2 - 1);
    const cx = size / 2;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><circle cx='${cx}' cy='${cx}' r='${r}' fill='none' stroke='white' stroke-width='1.5'/></svg>`;
    const hotspot = Math.floor(size / 2);
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotspot} ${hotspot}, crosshair`;
  })();

  return (
    <div
      className="viewport"
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ cursor: activeTool === "pan" ? "grab" : brushCursor }}
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
              visibility: showImage ? "visible" : "hidden",
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
              ...preStyle,
              position: "absolute",
              inset: 0,
              color: scene.ascii.color,
              opacity: scene.ascii.opacity,
              mixBlendMode: scene.ascii.blendMode as React.CSSProperties["mixBlendMode"],
              zIndex: 2,
              visibility: showAscii ? "visible" : "hidden",
            }}
          />
          <pre
            ref={effectPreRef}
            className="ascii-overlay"
            style={{
              ...preStyle,
              position: "absolute",
              inset: 0,
              color: "transparent",
              opacity: 1,
              mixBlendMode: scene.ascii.blendMode as React.CSSProperties["mixBlendMode"],
              zIndex: 3,
              pointerEvents: "none",
              visibility: showEffects ? "visible" : "hidden",
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
              visibility: showEffects ? "visible" : "hidden",
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
          <div
            className="perf-panel-clip"
            aria-hidden={!showPerf}
          >
            <div className="perf-overlay">{perfDisplayText}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
