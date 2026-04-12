"use client";

import { useState, useEffect } from "react";
import * as Slider from "@radix-ui/react-slider";
import { useEditorStore } from "@/lib/store";
import {
  Cursor,
  PaintBrush,
  PaintBrushHousehold,
  Hand,
  Eye,
  EyeSlash,
  Eraser,
  CaretLeft,
  CaretRight,
  ArrowCounterClockwise,
  Command,
  Control,
  ArrowFatUp,
} from "@phosphor-icons/react";
import { ConfirmDialog } from "./ConfirmDialog";

export function ToolPanel() {
  const [clearMaskOpen, setClearMaskOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent));
  }, []);
  const ModKey = isMac ? <Command size={10} weight="bold" /> : <Control size={10} weight="bold" />;
  const ShiftKey = <ArrowFatUp size={10} weight="bold" />;
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const brushSize = useEditorStore((s) => s.brushSize);
  const setBrushSize = useEditorStore((s) => s.setBrushSize);
  const maskFeather = useEditorStore((s) => s.maskFeather);
  const setMaskFeather = useEditorStore((s) => s.setMaskFeather);
  const showMask = useEditorStore((s) => s.showMask);
  const showAscii = useEditorStore((s) => s.showAscii);
  const showEffects = useEditorStore((s) => s.showEffects);
  const showImage = useEditorStore((s) => s.showImage);
  const toggleLayer = useEditorStore((s) => s.toggleLayer);
  const mask = useEditorStore((s) => s.mask);
  const bumpMaskVersion = useEditorStore((s) => s.bumpMaskVersion);
  const collapsed = useEditorStore((s) => s.leftPanelCollapsed);
  const toggleCollapsed = useEditorStore((s) => s.toggleLeftPanel);

  const tools = [
    { id: "select" as const, icon: <Cursor size={16} />, title: "Select (S)", shortcut: "S" },
    { id: "brush-fg" as const, icon: <PaintBrush size={16} />, title: "Foreground brush (B)", shortcut: "B" },
    { id: "brush-bg" as const, icon: <PaintBrushHousehold size={16} />, title: "Background brush (N)", shortcut: "N" },
    { id: "pan" as const, icon: <Hand size={16} />, title: "Pan (V)", shortcut: "V" },
  ];

  function handleClearMask() {
    if (mask) {
      mask.clear(255);
      bumpMaskVersion();
    }
  }

  if (collapsed) {
    return (
      <div className="panel panel--collapsed" role="complementary" aria-label="Tools and layers">
        <button
          className="panel-collapse-btn"
          onClick={toggleCollapsed}
          title="Expand panel"
          aria-label="Expand tools panel"
        >
          <CaretRight size={12} />
        </button>
        <div className="panel-collapsed-tools">
          {tools.map((t) => (
            <button
              key={t.id}
              className={`tool-btn ${activeTool === t.id ? "tool-btn--active" : ""}`}
              title={t.title}
              aria-label={t.title}
              onClick={() => setActiveTool(t.id)}
            >
              {t.icon}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="panel" role="complementary" aria-label="Tools and layers">
      <div className="panel-section">
        <div className="panel-label">
          <span>Tools</span>
          <button
            className="panel-collapse-btn"
            onClick={toggleCollapsed}
            title="Collapse panel"
            aria-label="Collapse tools panel"
          >
            <CaretLeft size={12} />
          </button>
        </div>
        <div className="tool-grid">
          {tools.map((t) => (
            <button
              key={t.id}
              className={`tool-btn ${activeTool === t.id ? "tool-btn--active" : ""}`}
              title={t.title}
              aria-label={t.title}
              onClick={() => setActiveTool(t.id)}
            >
              {t.icon}
              <span className="tool-shortcut">{t.shortcut}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-label">Mask</div>
        <div className="prop-row">
          <span className="prop-label">Brush size</span>
          <span className="prop-value-group">
            {brushSize !== 20 && (
              <button className="prop-reset-btn" title="Reset to default" onClick={() => setBrushSize(20)}>
                <ArrowCounterClockwise size={11} />
              </button>
            )}
            <input
              className="prop-value prop-value--input"
              type="text"
              inputMode="numeric"
              value={brushSize}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n)) setBrushSize(Math.max(4, Math.min(100, Math.round(n))));
              }}
            />
          </span>
        </div>
        <Slider.Root
          className="slider-root"
          value={[brushSize]}
          min={4}
          max={100}
          step={1}
          onValueChange={([v]) => setBrushSize(v)}
        >
          <Slider.Track className="slider-track">
            <Slider.Range className="slider-range" />
          </Slider.Track>
          <Slider.Thumb className="slider-thumb" />
        </Slider.Root>
        <div className="prop-row" style={{ marginTop: 8 }}>
          <span className="prop-label">Feather</span>
          <span className="prop-value-group">
            {maskFeather !== 4 && (
              <button className="prop-reset-btn" title="Reset to default" onClick={() => setMaskFeather(4)}>
                <ArrowCounterClockwise size={11} />
              </button>
            )}
            <input
              className="prop-value prop-value--input"
              type="text"
              inputMode="numeric"
              value={maskFeather}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n)) setMaskFeather(Math.max(0, Math.min(20, Math.round(n))));
              }}
            />
          </span>
        </div>
        <Slider.Root
          className="slider-root"
          value={[maskFeather]}
          min={0}
          max={20}
          step={1}
          onValueChange={([v]) => setMaskFeather(v)}
        >
          <Slider.Track className="slider-track">
            <Slider.Range className="slider-range" />
          </Slider.Track>
          <Slider.Thumb className="slider-thumb" />
        </Slider.Root>

        <button className="mask-clear-btn" onClick={() => setClearMaskOpen(true)}>
          <Eraser size={12} />
          <span>Clear mask</span>
        </button>
        <ConfirmDialog
          open={clearMaskOpen}
          onOpenChange={setClearMaskOpen}
          title="Clear mask"
          description="This will reset the entire mask to background. Painted foreground regions will be lost."
          confirmLabel="Clear"
          onConfirm={handleClearMask}
        />
      </div>

      <div className="panel-section">
        <div className="panel-label">Layers</div>
        {[
          { key: "effects" as const, label: "Effects", active: showEffects },
          { key: "mask" as const, label: "Mask overlay", active: showMask },
          { key: "ascii" as const, label: "ASCII Grid", active: showAscii },
        ].map((layer) => (
          <div
            key={layer.key}
            className={`layer-item ${layer.active ? "layer-item--active" : ""}`}
            role="button"
            aria-pressed={layer.active}
            onClick={() => toggleLayer(layer.key)}
          >
            <span>{layer.label}</span>
            <button className="layer-vis">
              {layer.active ? <Eye size={14} /> : <EyeSlash size={14} />}
            </button>
          </div>
        ))}
        <div
          key="image"
          className={`layer-item ${showImage ? "layer-item--active" : ""}`}
          role="button"
          aria-pressed={showImage}
          onClick={() => toggleLayer("image")}
        >
          <span>Source Image</span>
          <button className="layer-vis">
            {showImage ? <Eye size={14} /> : <EyeSlash size={14} />}
          </button>
        </div>
      </div>

      <div className="panel-section panel-section--shortcuts">
        <div className="panel-label">Shortcuts</div>
        <div className="shortcut-list">
          <div className="shortcut-item"><span className="kbd-group"><kbd>Space</kbd></span><span>Play / Pause</span></div>
          <div className="shortcut-item"><span className="kbd-group"><kbd>S</kbd></span><span>Select tool</span></div>
          <div className="shortcut-item"><span className="kbd-group"><kbd>B</kbd></span><span>Foreground brush</span></div>
          <div className="shortcut-item"><span className="kbd-group"><kbd>N</kbd></span><span>Background brush</span></div>
          <div className="shortcut-item"><span className="kbd-group"><kbd>V</kbd></span><span>Pan tool</span></div>
          <div className="shortcut-item"><span className="kbd-group"><kbd>M</kbd></span><span>Toggle mask</span></div>
          <div className="shortcut-item"><span className="kbd-group"><kbd>[</kbd><kbd>]</kbd></span><span>Brush size</span></div>
          <div className="shortcut-item" suppressHydrationWarning><span className="kbd-group"><kbd>{ModKey}</kbd><kbd>Z</kbd></span><span>Undo</span></div>
          <div className="shortcut-item" suppressHydrationWarning><span className="kbd-group"><kbd>{ModKey}</kbd><kbd>{ShiftKey}</kbd><kbd>Z</kbd></span><span>Redo</span></div>
        </div>
      </div>
    </div>
  );
}
