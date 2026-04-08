"use client";

import { useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import { useEditorStore } from "@/lib/store";
import {
  PaintBrush,
  MagicWand,
  Hand,
  Eye,
  EyeSlash,
  Eraser,
} from "@phosphor-icons/react";
import { ConfirmDialog } from "./ConfirmDialog";

export function ToolPanel() {
  const [clearMaskOpen, setClearMaskOpen] = useState(false);
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

  const tools = [
    { id: "brush-fg" as const, icon: <PaintBrush size={16} />, title: "Foreground brush (B)", shortcut: "B" },
    { id: "brush-bg" as const, icon: <MagicWand size={16} />, title: "Background brush (N)", shortcut: "N" },
    { id: "pan" as const, icon: <Hand size={16} />, title: "Pan (V)", shortcut: "V" },
  ];

  function handleClearMask() {
    if (mask) {
      mask.clear(255);
      bumpMaskVersion();
    }
  }

  return (
    <div className="panel" role="complementary" aria-label="Tools and layers">
      <div className="panel-section">
        <div className="panel-label">Tools</div>
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
        <div className="mask-actions">
          <button
            className={`mask-btn ${activeTool === "brush-fg" ? "mask-btn--active" : ""}`}
            onClick={() => setActiveTool("brush-fg")}
          >
            Foreground
          </button>
          <button
            className={`mask-btn ${activeTool === "brush-bg" ? "mask-btn--active" : ""}`}
            onClick={() => setActiveTool("brush-bg")}
          >
            Background
          </button>
        </div>
        <div className="prop-row">
          <span className="prop-label">Brush size</span>
          <span className="prop-value">{brushSize}px</span>
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
          <span className="prop-value">{maskFeather}px</span>
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
          <div className="shortcut-item"><kbd>Space</kbd><span>Play / Pause</span></div>
          <div className="shortcut-item"><kbd>B</kbd><span>Foreground brush</span></div>
          <div className="shortcut-item"><kbd>N</kbd><span>Background brush</span></div>
          <div className="shortcut-item"><kbd>V</kbd><span>Pan tool</span></div>
          <div className="shortcut-item"><kbd>M</kbd><span>Toggle mask</span></div>
          <div className="shortcut-item"><kbd>[ ]</kbd><span>Brush size</span></div>
          <div className="shortcut-item"><kbd>⌘Z</kbd><span>Undo</span></div>
          <div className="shortcut-item"><kbd>⌘⇧Z</kbd><span>Redo</span></div>
        </div>
      </div>
    </div>
  );
}
