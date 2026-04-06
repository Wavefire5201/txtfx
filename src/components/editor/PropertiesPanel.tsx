"use client";

import * as Switch from "@radix-ui/react-switch";
import * as Slider from "@radix-ui/react-slider";
import { useEditorStore } from "@/lib/store";
import { EFFECT_LABELS, type EffectType } from "@/engine/effects";

const ALL_EFFECT_TYPES: EffectType[] = [
  "twinkle", "meteor", "rain", "snow", "fire", "matrix",
  "waves", "glitch", "typewriter", "decode", "firework", "custom-emitter",
];

export function PropertiesPanel() {
  const scene = useEditorStore((s) => s.scene);
  const updateAscii = useEditorStore((s) => s.updateAscii);
  const addEffect = useEditorStore((s) => s.addEffect);
  const toggleEffect = useEditorStore((s) => s.toggleEffect);
  const removeEffect = useEditorStore((s) => s.removeEffect);
  const updateEffect = useEditorStore((s) => s.updateEffect);

  return (
    <div className="panel">
      <div className="panel-section">
        <div className="panel-label">ASCII Settings</div>
        <div className="prop-row">
          <span className="prop-label">Char ramp</span>
          <span className="prop-value">{scene.ascii.ramp}</span>
        </div>
        <div className="prop-row">
          <span className="prop-label">Font size</span>
          <span className="prop-value">{scene.ascii.fontSize}</span>
        </div>
        <div className="prop-row">
          <span className="prop-label">Blend mode</span>
          <span className="prop-value">{scene.ascii.blendMode}</span>
        </div>
        <div className="prop-row">
          <span className="prop-label">Opacity</span>
          <span className="prop-value">{Math.round(scene.ascii.opacity * 100)}%</span>
        </div>
        <Slider.Root
          className="slider-root"
          value={[scene.ascii.opacity]}
          min={0}
          max={1}
          step={0.01}
          onValueChange={([v]) => updateAscii({ opacity: v })}
        >
          <Slider.Track className="slider-track">
            <Slider.Range className="slider-range" />
          </Slider.Track>
          <Slider.Thumb className="slider-thumb" />
        </Slider.Root>
      </div>

      <div className="panel-section" style={{ flex: 1 }}>
        <div className="panel-label">Effects</div>
        {scene.effects.map((fx) => {
          const meta = EFFECT_LABELS[fx.type];
          return (
            <div key={fx.id} className="effect-card">
              <div className="effect-card-header">
                <span style={{ color: fx.enabled ? "var(--text-bright)" : "var(--text-dim)" }}>
                  {meta.icon} {meta.label}
                </span>
                <Switch.Root
                  className="switch-root"
                  checked={fx.enabled}
                  onCheckedChange={() => toggleEffect(fx.id)}
                >
                  <Switch.Thumb className="switch-thumb" />
                </Switch.Root>
              </div>
              <div className="effect-card-meta">
                <select
                  value={fx.maskRegion}
                  onChange={(e) => updateEffect(fx.id, { maskRegion: e.target.value as "foreground" | "background" | "both" })}
                  style={{
                    background: "var(--bg-card)",
                    color: "var(--text)",
                    border: "none",
                    borderRadius: "4px",
                    padding: "2px 4px",
                    fontSize: "10px",
                    marginRight: 8,
                  }}
                >
                  <option value="background">Background</option>
                  <option value="foreground">Foreground</option>
                  <option value="both">Both</option>
                </select>
                <button
                  onClick={() => removeEffect(fx.id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: "10px",
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}

        <div style={{ position: "relative" }}>
          <select
            className="effect-add"
            value=""
            onChange={(e) => {
              if (e.target.value) addEffect(e.target.value as EffectType);
              e.target.value = "";
            }}
            style={{
              width: "100%",
              background: "var(--bg-toolbar)",
              color: "var(--text-muted)",
              border: "1px dashed var(--text-muted)",
              borderRadius: "var(--radius)",
              padding: "8px",
              fontSize: "11px",
              cursor: "pointer",
              appearance: "none",
              textAlign: "center",
            }}
          >
            <option value="">+ Add Effect</option>
            {ALL_EFFECT_TYPES.map((type) => (
              <option key={type} value={type}>
                {EFFECT_LABELS[type].icon} {EFFECT_LABELS[type].label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
