"use client";

import * as Slider from "@radix-ui/react-slider";
import { useEditorStore } from "@/lib/store";
import { PaintBrush, MagicWand, Selection, Hand, Eye, EyeSlash } from "@phosphor-icons/react";

export function ToolPanel() {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const brushSize = useEditorStore((s) => s.brushSize);
  const setBrushSize = useEditorStore((s) => s.setBrushSize);
  const maskFeather = useEditorStore((s) => s.maskFeather);
  const setMaskFeather = useEditorStore((s) => s.setMaskFeather);
  const showMask = useEditorStore((s) => s.showMask);
  const showAscii = useEditorStore((s) => s.showAscii);
  const showEffects = useEditorStore((s) => s.showEffects);
  const toggleLayer = useEditorStore((s) => s.toggleLayer);

  const tools = [
    { id: "brush-fg" as const, icon: <PaintBrush size={16} />, title: "Paint foreground" },
    { id: "brush-bg" as const, icon: <MagicWand size={16} />, title: "Paint background" },
    { id: "select" as const, icon: <Selection size={16} />, title: "Select" },
    { id: "pan" as const, icon: <Hand size={16} />, title: "Pan" },
  ];

  return (
    <div className="panel">
      <div className="panel-section">
        <div className="panel-label">Tools</div>
        <div className="tool-grid">
          {tools.map((t) => (
            <button
              key={t.id}
              className={`tool-btn ${activeTool === t.id ? "tool-btn--active" : ""}`}
              title={t.title}
              onClick={() => setActiveTool(t.id)}
            >
              {t.icon}
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
      </div>

      <div className="panel-section">
        <div className="panel-label">Layers</div>
        {[
          { key: "effects" as const, label: "Effects", active: showEffects },
          { key: "mask" as const, label: "Mask", active: showMask },
          { key: "ascii" as const, label: "ASCII Grid", active: showAscii },
        ].map((layer) => (
          <div
            key={layer.key}
            className={`layer-item ${layer.active ? "layer-item--active" : ""}`}
            onClick={() => toggleLayer(layer.key)}
          >
            <span>{layer.label}</span>
            <button className="layer-vis">
              {layer.active ? <Eye size={14} /> : <EyeSlash size={14} />}
            </button>
          </div>
        ))}
        <div className="layer-item layer-item--active">
          <span>Source Image</span>
          <button className="layer-vis"><Eye size={14} /></button>
        </div>
      </div>
    </div>
  );
}
