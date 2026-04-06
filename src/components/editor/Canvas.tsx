"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useEditorStore } from "@/lib/store";
import { measureGrid, imageToAscii, sampleMeanColor } from "@/engine/ascii";
import { createEffect } from "@/engine/effects";
import { compositeFrame, type ActiveEffect } from "@/engine/renderer";
import type { GridInfo, MaskGrid } from "@/engine/effects/types";
import { ImageSquare, UploadSimple } from "@phosphor-icons/react";
import type { WavesEffect } from "@/engine/effects/waves";
import type { TypewriterEffect } from "@/engine/effects/typewriter";
import type { DecodeEffect } from "@/engine/effects/decode";

const EMPTY_MASK: MaskGrid = { get: () => 1 };

export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const asciiRef = useRef<HTMLPreElement>(null);
  const sparkleRef = useRef<HTMLPreElement>(null);
  const maskOverlayRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const imageUrl = useEditorStore((s) => s.imageUrl);
  const setImageUrl = useEditorStore((s) => s.setImageUrl);
  const scene = useEditorStore((s) => s.scene);
  const showAscii = useEditorStore((s) => s.showAscii);
  const showEffects = useEditorStore((s) => s.showEffects);
  const showMask = useEditorStore((s) => s.showMask);
  const playing = useEditorStore((s) => s.playing);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const activeTool = useEditorStore((s) => s.activeTool);
  const brushSize = useEditorStore((s) => s.brushSize);
  const maskFeather = useEditorStore((s) => s.maskFeather);
  const initMask = useEditorStore((s) => s.initMask);
  const maskVersion = useEditorStore((s) => s.maskVersion);
  const bumpMaskVersion = useEditorStore((s) => s.bumpMaskVersion);

  const [grid, setGrid] = useState<GridInfo>({ cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 });
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [draggingOver, setDraggingOver] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const effectsRef = useRef<ActiveEffect[]>([]);
  const asciiTextRef = useRef<string>("");
  const animRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const lastTimeRef = useRef(0);
  const isPaintingRef = useRef(false);
  const lastPaintRef = useRef<{ x: number; y: number } | null>(null);
  const maskGridRef = useRef<MaskGrid>(EMPTY_MASK);

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
      if ("setBaseText" in inst && typeof (inst as WavesEffect | TypewriterEffect | DecodeEffect).setBaseText === "function") {
        (inst as WavesEffect | TypewriterEffect | DecodeEffect).setBaseText(text);
      }
    }
  }

  // Rebuild effects when scene effects change
  useEffect(() => {
    const configs = scene.effects;
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
      };
    });
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

  // Animation loop
  useEffect(() => {
    if (!playing) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    // Start from current scrubbed time
    const resumeFrom = useEditorStore.getState().currentTime;
    startTimeRef.current = performance.now() - resumeFrom * 1000;
    lastTimeRef.current = resumeFrom;

    const duration = scene.playback.duration;
    const loop = scene.playback.loop;

    function tick() {
      const elapsed = (performance.now() - startTimeRef.current) / 1000;
      let now = elapsed;
      if (loop && duration > 0) {
        now = elapsed % duration;
      } else if (now > duration) {
        useEditorStore.getState().setPlaying(false);
        useEditorStore.getState().setCurrentTime(duration);
        return;
      }

      const dt = Math.min(0.05, Math.abs(now - lastTimeRef.current));
      lastTimeRef.current = now;

      setCurrentTime(now);

      if (grid.cols > 0 && sparkleRef.current) {
        const currentMask = maskGridRef.current;
        const overlay = compositeFrame(effectsRef.current, dt, now, currentMask, grid);
        sparkleRef.current.textContent = overlay;
      }

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [playing, grid, scene.playback.duration, scene.playback.loop]);

  // When scrubbing while paused, render a single frame at that time
  useEffect(() => {
    if (playing) return;
    const time = useEditorStore.getState().currentTime;
    if (grid.cols > 0 && sparkleRef.current && effectsRef.current.length > 0) {
      const currentMask = maskGridRef.current;
      const overlay = compositeFrame(effectsRef.current, 0.016, time, currentMask, grid);
      sparkleRef.current.textContent = overlay;
    }
  });

  // Auto-play when effects are added
  useEffect(() => {
    if (scene.effects.length > 0 && imageUrl && !playing) {
      setPlaying(true);
    }
  }, [scene.effects.length, imageUrl]);

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
    if (activeTool !== "brush-fg" && activeTool !== "brush-bg") return;
    isPaintingRef.current = true;
    lastPaintRef.current = null;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const coords = getMaskCoords(e);
    if (coords) paintStroke(coords.x, coords.y);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isPaintingRef.current) return;
    const coords = getMaskCoords(e);
    if (coords) paintStroke(coords.x, coords.y);
  }

  function handlePointerUp() {
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
    const reader = new FileReader();
    reader.onload = () => setImageUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  const fontSize = scene.ascii.fontSize;
  const fontFamily = scene.ascii.fontFamily;

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
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
      style={{ cursor: isBrushTool ? "crosshair" : undefined }}
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
          style={{ width: "100%", height: "100%", position: "relative" }}
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
            ref={maskOverlayRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              zIndex: 4,
              pointerEvents: "none",
              visibility: showMask ? "visible" : "hidden",
            }}
          />
        </div>
      )}

      {imageUrl && (
        <div className="viewport-info">
          <span>100%</span>
          <span className="viewport-info-sep">|</span>
          <span>{imgSize.w} x {imgSize.h}</span>
          <span className="viewport-info-sep">|</span>
          <span>{grid.cols} x {grid.rows} chars</span>
        </div>
      )}
    </div>
  );
}
