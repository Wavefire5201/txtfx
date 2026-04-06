"use client";

import * as Slider from "@radix-ui/react-slider";
import { useEditorStore } from "@/lib/store";

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
    { id: "brush-fg" as const, icon: "\uD83D\uDD8C\uFE0F", title: "Paint foreground" },
    { id: "brush-bg" as const, icon: "\uD83E\uDE84", title: "Paint background" },
    { id: "select" as const, icon: "\u2B1C", title: "Select" },
    { id: "pan" as const, icon: "\u270B", title: "Pan" },
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
        <div
          className={`layer-item ${showEffects ? "layer-item--active" : ""}`}
          onClick={() => toggleLayer("effects")}
        >
          <span>{showEffects ? "\u2728" : "\u2B1C"} Effects</span>
          <button className="layer-vis">{showEffects ? "\uD83D\uDC41" : "\u2014"}</button>
        </div>
        <div
          className={`layer-item ${showMask ? "layer-item--active" : ""}`}
          onClick={() => toggleLayer("mask")}
        >
          <span>{showMask ? "\u25D0" : "\u2B1C"} Mask</span>
          <button className="layer-vis">{showMask ? "\uD83D\uDC41" : "\u2014"}</button>
        </div>
        <div
          className={`layer-item ${showAscii ? "layer-item--active" : ""}`}
          onClick={() => toggleLayer("ascii")}
        >
          <span>{showAscii ? "\u25A4" : "\u2B1C"} ASCII Grid</span>
          <button className="layer-vis">{showAscii ? "\uD83D\uDC41" : "\u2014"}</button>
        </div>
        <div className="layer-item layer-item--active">
          <span>\uD83D\uDDBC Source Image</span>
          <button className="layer-vis">\uD83D\uDC41</button>
        </div>
      </div>
    </div>
  );
}
