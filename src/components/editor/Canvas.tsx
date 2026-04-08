"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useEditorStore } from "@/lib/store";
import { Mask } from "@/engine/mask";
import { measureGrid, imageToAscii, sampleMeanColor } from "@/engine/ascii";
import { createEffect } from "@/engine/effects";
import { compositeFrame, type ActiveEffect, type GlowCell } from "@/engine/renderer";
import type { GridInfo, MaskGrid } from "@/engine/effects/types";
import { ImageSquare, UploadSimple } from "@phosphor-icons/react";
import { toast } from "./Toast";
import type { TypewriterEffect } from "@/engine/effects/typewriter";
import type { DecodeEffect } from "@/engine/effects/decode";

const EMPTY_MASK: MaskGrid = { get: () => 1 };

export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const asciiRef = useRef<HTMLPreElement>(null);
  const sparkleRef = useRef<HTMLPreElement>(null);
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
  const [draggingOver, setDraggingOver] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const effectsRef = useRef<ActiveEffect[]>([]);
  const asciiTextRef = useRef<string>("");
  const animRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const lastTimeRef = useRef(0);
  const lastRenderedTimeRef = useRef(0);
  const lastStoreUpdateRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const isPaintingRef = useRef(false);
  const lastPaintRef = useRef<{ x: number; y: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number } | null>(null);
  const maskGridRef = useRef<MaskGrid>(EMPTY_MASK);
  const perfRef = useRef<HTMLDivElement>(null);
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

    // Fall back to localStorage restore
    try {
      const saved = localStorage.getItem("txtfx-autosave");
      if (!saved) return;
      const data = JSON.parse(saved);
      if (data.scene) {
        useEditorStore.getState().setScene(data.scene);
      }
      if (data.imageUrl) {
        useEditorStore.getState().setImageUrl(data.imageUrl);
      }
      if (data.maskData && data.maskWidth) {
        Mask.fromBase64(data.maskData, data.maskWidth, data.maskHeight).then((restored) => {
          useEditorStore.getState().setMask(restored);
        }).catch(() => { /* corrupt mask data — ignore */ });
      }
    } catch {
      // Invalid saved data — ignore
    }
  }, []);

  // Load image
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
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
      // Just update params and metadata on existing instances
      effectsRef.current = configs.map((cfg, i) => {
        const existing = prev[i];
        if (grid.cols > 0) existing.instance.init(grid, cfg.params);
        return {
          ...existing,
          maskRegion: cfg.maskRegion,
          enabled: cfg.enabled,
          timelineStart: cfg.timeline.start,
          timelineEnd: cfg.timeline.end,
          loop: cfg.timeline.loop,
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
          loop: cfg.timeline.loop,
          applyToAscii: cfg.applyToAscii ?? false,
        };
      });
    }
    if (asciiTextRef.current) {
      feedBaseText(effectsRef.current, asciiTextRef.current);
    }
  }, [scene.effects, grid]);

  const regenerate = useCallback(() => {
    const img = imgRef.current;
    const pre = asciiRef.current;
    if (!img || !pre) return;

    const g = measureGrid(pre);
    setGrid(g);

    const text = imageToAscii(img, g, { ramp: scene.ascii.ramp });
    pre.textContent = text;
    asciiTextRef.current = text;

    const configs = scene.effects;
    for (let i = 0; i < effectsRef.current.length && i < configs.length; i++) {
      effectsRef.current[i].instance.init(g, configs[i].params);
    }

    feedBaseText(effectsRef.current, text);
  }, [scene.ascii.ramp, scene.effects]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => regenerate());
    obs.observe(el);
    return () => obs.disconnect();
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
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

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
  }, [showMask, maskVersion, imgSize]);

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
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = rect.height;

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

    if (count === 0) return;

    const fontStr = `${grid.fontSize}px ${scene.ascii.fontFamily}`;
    if (fontStr !== lastFontRef.current) {
      ctx.font = fontStr;
      lastFontRef.current = fontStr;
    }
    ctx.textBaseline = "top";
    const padLeft = 8;
    const padTop = 10;

    let prevHex = "";
    let cR = 0, cG = 0, cB = 0;
    // Pre-build RGBA strings per unique color (most effects use 1 color)
    let glowCenter = "";
    let glowMid = "";
    let glowFill = "";

    for (let i = 0; i < count; i++) { const cell = glowCells[i];
      const x = padLeft + cell.col * grid.charW;
      const y = padTop + cell.row * grid.charH;
      const cx = x + grid.charW * 0.5;
      const cy = y + grid.charH * 0.5;
      const a = cell.brightness;

      if (cell.color !== prevHex) {
        prevHex = cell.color;
        cR = parseInt(cell.color.slice(1, 3), 16) || 0;
        cG = parseInt(cell.color.slice(3, 5), 16) || 0;
        cB = parseInt(cell.color.slice(5, 7), 16) || 0;
        // Cache color strings — only rebuilt on color change
        const rgb = `${cR},${cG},${cB}`;
        glowCenter = `rgba(${rgb},`;
        glowMid = glowCenter;
        glowFill = `rgb(${rgb})`;
        ctx.fillStyle = glowFill;
        ctx.shadowColor = glowFill;
      }

      // Colored radial gradient glow
      const gr = cell.glowRadius ?? 18;
      if (gr > 0) {
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr);
        grad.addColorStop(0, glowCenter + (a * 0.7) + ")");
        grad.addColorStop(0.4, glowMid + (a * 0.28) + ")");
        grad.addColorStop(1, glowCenter + "0)");
        ctx.fillStyle = grad;
        ctx.fillRect(cx - gr, cy - gr, gr * 2, gr * 2);
      }

      // Colored text with shadow
      ctx.fillStyle = glowFill;
      ctx.globalAlpha = Math.min(1, a * 0.95);
      ctx.shadowBlur = gr > 0 ? 10 : 0;
      ctx.fillText(cell.char, x, y);
      ctx.globalAlpha = 1;
    }
    ctx.shadowBlur = 0;
  }

  // Animation loop
  useEffect(() => {
    if (!playing) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    // Resume from current position without re-simulating (effects already have correct state)
    const resumeFrom = useEditorStore.getState().currentTime;
    startTimeRef.current = performance.now() - resumeFrom * 1000;
    lastTimeRef.current = resumeFrom;
    lastFrameTimeRef.current = 0; // ensure first frame renders immediately

    const duration = scene.playback.duration;
    const loop = scene.playback.loop;

    function tick() {
      const elapsed = (performance.now() - startTimeRef.current) / 1000;
      let now = elapsed;
      if (loop && duration > 0) {
        now = elapsed % duration;
      }

      // Detect loop wrap and re-initialize effects
      if (now < lastTimeRef.current) {
        simulateToTime(now);
      }

      if (!loop && now > duration) {
        useEditorStore.getState().setPlaying(false);
        useEditorStore.getState().setCurrentTime(duration);
        return;
      }

      // Frame-rate gating: skip render if below target interval
      // Use wall-clock time (not looped playback time) to avoid wrap issues
      const wallNow = performance.now() / 1000;
      const targetInterval = 1 / (scene.playback.fps || 30);
      if (wallNow - lastFrameTimeRef.current < targetInterval) {
        animRef.current = requestAnimationFrame(tick);
        return;
      }
      lastFrameTimeRef.current = wallNow;

      // Calculate dt from last rendered time (not last tick) so skipped frames don't lose simulation time
      const dt = Math.min(0.05, Math.abs(now - lastTimeRef.current));
      lastTimeRef.current = now;
      lastRenderedTimeRef.current = now;

      if (now - lastStoreUpdateRef.current > 0.1) {
        setCurrentTime(now);
        lastStoreUpdateRef.current = now;
      }

      if (grid.cols > 0 && sparkleRef.current) {
        const currentMask = maskGridRef.current;
        const result = compositeFrame(effectsRef.current, dt, now, currentMask, grid, asciiTextRef.current);
        sparkleRef.current.textContent = result.text;
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
        if (perfRef.current) {
          perfRef.current.textContent = `${fps} fps · ${frameMs}ms · ${perfCells.current} cells · ${perfGlow.current} glow`;
        }
      }

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [playing, grid, scene.playback.duration, scene.playback.loop]);

  // When scrubbing while paused or editing effects while paused, re-render
  useEffect(() => {
    if (playing) return;

    if (grid.cols > 0 && sparkleRef.current && effectsRef.current.length > 0) {
      simulateToTime(currentTime);
      const currentMask = maskGridRef.current;
      const result = compositeFrame(effectsRef.current, 0.016, currentTime, currentMask, grid, asciiTextRef.current);
      sparkleRef.current.textContent = result.text;
      renderGlow(result.glowCells, result.glowCount);
    }
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
      if (scene.effects.length > 0) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [scene.effects.length]);

  // Mask painting
  function getMaskCoords(e: React.MouseEvent): { x: number; y: number } | null {
    const container = containerRef.current;
    if (!container || !imgRef.current) return null;
    const rect = container.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    return {
      x: Math.floor(relX * imgSize.w),
      y: Math.floor(relY * imgSize.h),
    };
  }

  function paintStroke(x: number, y: number) {
    const m = useEditorStore.getState().mask;
    if (!m) return;
    const value = activeTool === "brush-fg" ? 0 : 255;
    const scale = imgSize.w / (containerRef.current?.getBoundingClientRect().width || 1);
    const r = Math.floor(brushSize * scale);

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
          m.paintBrush(cx, cy, r, value, maskFeather);
        }
        if (cx === x && cy === y) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; cx += sx; }
        if (e2 < dx) { err += dx; cy += sy; }
        steps++;
        if (steps > 100000) break; // safety
      }
    } else {
      m.paintBrush(x, y, r, value, maskFeather);
    }

    lastPaintRef.current = { x, y };
    bumpMaskVersion();
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (activeTool === "pan") {
      panStartRef.current = { x: e.clientX, y: e.clientY, startPanX: panX, startPanY: panY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (activeTool !== "brush-fg" && activeTool !== "brush-bg") return;
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
  const fontFamily = scene.ascii.fontFamily;

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
    fontFamily,
    fontSize,
    lineHeight: scene.ascii.lineHeight,
    letterSpacing: scene.ascii.letterSpacing,
  };

  const isBrushTool = activeTool === "brush-fg" || activeTool === "brush-bg";

  return (
    <div
      className="viewport"
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ cursor: activeTool === "pan" ? "grab" : isBrushTool ? "crosshair" : undefined }}
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
          style={{ width: "100%", height: "100%", position: "relative", transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`, transformOrigin: "center center" }}
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
              backgroundSize: "cover",
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
            ref={sparkleRef}
            className="ascii-sparkle"
            style={{
              ...preStyle,
              position: "absolute",
              inset: 0,
              zIndex: 3,
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
          <button className="zoom-btn" onClick={() => setZoom(zoom - 0.25)} title="Zoom out">−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="zoom-btn" onClick={() => setZoom(zoom + 0.25)} title="Zoom in">+</button>
          {(zoom !== 1 || panX !== 0 || panY !== 0) && (
            <button className="zoom-btn" onClick={() => { setZoom(1); setPan(0, 0); }} title="Reset view">⟲</button>
          )}
          <span className="viewport-info-sep">|</span>
          <span>{imgSize.w} x {imgSize.h}</span>
          <span className="viewport-info-sep">|</span>
          <span>{grid.cols} x {grid.rows} chars</span>
        </div>
      )}
      {playing && (
        <div
          ref={perfRef}
          className="perf-overlay"
        />
      )}
    </div>
  );
}
