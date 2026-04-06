"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useEditorStore } from "@/lib/store";
import { measureGrid, imageToAscii, sampleMeanColor } from "@/engine/ascii";
import { createEffect } from "@/engine/effects";
import { compositeFrame, type ActiveEffect } from "@/engine/renderer";
import type { GridInfo, MaskGrid } from "@/engine/effects/types";
import { ImageSquare } from "@phosphor-icons/react";

const EMPTY_MASK: MaskGrid = { get: () => 1 };

export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const asciiRef = useRef<HTMLPreElement>(null);
  const sparkleRef = useRef<HTMLPreElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const imageUrl = useEditorStore((s) => s.imageUrl);
  const setImageUrl = useEditorStore((s) => s.setImageUrl);
  const scene = useEditorStore((s) => s.scene);
  const showAscii = useEditorStore((s) => s.showAscii);
  const showEffects = useEditorStore((s) => s.showEffects);
  const playing = useEditorStore((s) => s.playing);
  const setPlaying = useEditorStore((s) => s.setPlaying);

  const [grid, setGrid] = useState<GridInfo>({ cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 });
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  const imgRef = useRef<HTMLImageElement | null>(null);
  const effectsRef = useRef<ActiveEffect[]>([]);
  const animRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const lastTimeRef = useRef(0);

  // Load image
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });

      if (bgRef.current) {
        bgRef.current.style.backgroundImage = `url("${imageUrl}")`;
        const [r, g, b] = sampleMeanColor(img);
        bgRef.current.style.backgroundColor = `rgb(${(r * 0.5) | 0}, ${(g * 0.5) | 0}, ${(b * 0.5) | 0})`;
      }

      regenerate();
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Rebuild effects when scene effects change
  useEffect(() => {
    effectsRef.current = scene.effects.map((cfg) => {
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
  }, [scene.effects, grid]);

  const regenerate = useCallback(() => {
    const img = imgRef.current;
    const pre = asciiRef.current;
    if (!img || !pre) return;

    const g = measureGrid(pre);
    setGrid(g);

    const text = imageToAscii(img, g, { ramp: scene.ascii.ramp });
    pre.textContent = text;

    // Re-init all effects with new grid
    for (const fx of effectsRef.current) {
      fx.instance.init(g, {});
    }
  }, [scene.ascii.ramp]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => regenerate());
    obs.observe(el);
    return () => obs.disconnect();
  }, [regenerate]);

  // Animation loop
  useEffect(() => {
    if (!playing || !showEffects) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    startTimeRef.current = performance.now();
    lastTimeRef.current = 0;

    function loop() {
      const now = (performance.now() - startTimeRef.current) / 1000;
      const dt = Math.min(0.05, now - lastTimeRef.current);
      lastTimeRef.current = now;

      if (grid.cols > 0 && sparkleRef.current) {
        const overlay = compositeFrame(effectsRef.current, dt, now, EMPTY_MASK, grid);
        sparkleRef.current.textContent = overlay;
      }

      animRef.current = requestAnimationFrame(loop);
    }

    animRef.current = requestAnimationFrame(loop);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [playing, showEffects, grid]);

  // Auto-play when effects are added
  useEffect(() => {
    if (scene.effects.length > 0 && imageUrl && !playing) {
      setPlaying(true);
    }
  }, [scene.effects.length, imageUrl]);

  const fontSize = scene.ascii.fontSize;
  const fontFamily = scene.ascii.fontFamily;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
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

  return (
    <div className="viewport" ref={containerRef}>
      {!imageUrl ? (
        <div className="upload-overlay" onClick={() => fileRef.current?.click()}>
          <ImageSquare size={48} weight="thin" className="upload-overlay-icon" />
          <div className="upload-overlay-text">Click to upload an image</div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
        </div>
      ) : (
        <div
          className="viewport-canvas"
          style={{ width: "100%", height: "100%", position: "relative" }}
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
          {showAscii && (
            <pre
              ref={asciiRef}
              className="ascii-overlay"
              style={{
                ...preStyle,
                position: "absolute",
                inset: 0,
                color: scene.ascii.color,
                opacity: scene.ascii.opacity,
                zIndex: 2,
              }}
            />
          )}
          {showEffects && (
            <pre
              ref={sparkleRef}
              className="ascii-sparkle"
              style={{
                ...preStyle,
                position: "absolute",
                inset: 0,
                zIndex: 2,
              }}
            />
          )}
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
