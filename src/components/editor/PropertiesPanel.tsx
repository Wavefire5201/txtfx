"use client";

import { useState } from "react";
import * as Switch from "@radix-ui/react-switch";
import * as Slider from "@radix-ui/react-slider";
import { useEditorStore } from "@/lib/store";
import { createEffect, EFFECT_LABELS, type EffectType } from "@/engine/effects";
import type { ControlDescriptor } from "@/engine/effects/types";
import {
  CaretDown,
  CaretRight,
  Trash,
  Plus,
  Sparkle,
  Drop,
  Flame,
  Snowflake,
  Lightning,
  ShootingStar,
  CloudRain,
  Waves,
  Keyboard,
  Terminal,
  Fire,
  Gear,
} from "@phosphor-icons/react";

const ALL_EFFECT_TYPES: EffectType[] = [
  "twinkle", "meteor", "rain", "snow", "fire", "matrix",
  "waves", "glitch", "typewriter", "decode", "firework", "custom-emitter",
];

const EFFECT_ICONS: Record<EffectType, React.ReactNode> = {
  twinkle: <Sparkle size={14} />,
  meteor: <ShootingStar size={14} />,
  rain: <CloudRain size={14} />,
  snow: <Snowflake size={14} />,
  fire: <Flame size={14} />,
  matrix: <Terminal size={14} />,
  waves: <Waves size={14} />,
  glitch: <Lightning size={14} />,
  typewriter: <Keyboard size={14} />,
  decode: <Terminal size={14} />,
  firework: <Fire size={14} />,
  "custom-emitter": <Gear size={14} />,
};

// Cache controls per effect type so we don't re-create instances every render
const controlsCache = new Map<EffectType, ControlDescriptor[]>();
function getControlsForType(type: EffectType): ControlDescriptor[] {
  if (!controlsCache.has(type)) {
    const instance = createEffect(type);
    controlsCache.set(type, instance.getControls());
  }
  return controlsCache.get(type)!;
}

function EffectControl({
  descriptor,
  value,
  onChange,
}: {
  descriptor: ControlDescriptor;
  value: unknown;
  onChange: (key: string, val: unknown) => void;
}) {
  const current = value ?? descriptor.defaultValue;

  if (descriptor.type === "slider") {
    const numVal = typeof current === "number" ? current : Number(descriptor.defaultValue);
    return (
      <div className="effect-control">
        <div className="prop-row">
          <span className="prop-label">{descriptor.label}</span>
          <span className="prop-value">
            {Number.isInteger(descriptor.step ?? 1) ? numVal : numVal.toFixed(2)}
          </span>
        </div>
        <Slider.Root
          className="slider-root"
          value={[numVal]}
          min={descriptor.min ?? 0}
          max={descriptor.max ?? 100}
          step={descriptor.step ?? 1}
          onValueChange={([v]) => onChange(descriptor.key, v)}
        >
          <Slider.Track className="slider-track">
            <Slider.Range className="slider-range" />
          </Slider.Track>
          <Slider.Thumb className="slider-thumb" />
        </Slider.Root>
      </div>
    );
  }

  if (descriptor.type === "select" && descriptor.options) {
    return (
      <div className="effect-control">
        <div className="prop-row">
          <span className="prop-label">{descriptor.label}</span>
          <select
            className="effect-select"
            value={String(current)}
            onChange={(e) => onChange(descriptor.key, e.target.value)}
          >
            {descriptor.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  if (descriptor.type === "toggle") {
    return (
      <div className="effect-control">
        <div className="prop-row">
          <span className="prop-label">{descriptor.label}</span>
          <Switch.Root
            className="switch-root"
            checked={Boolean(current)}
            onCheckedChange={(checked) => onChange(descriptor.key, checked)}
          >
            <Switch.Thumb className="switch-thumb" />
          </Switch.Root>
        </div>
      </div>
    );
  }

  if (descriptor.type === "text") {
    return (
      <div className="effect-control">
        <div className="prop-row">
          <span className="prop-label">{descriptor.label}</span>
          <input
            className="effect-text-input"
            type="text"
            value={String(current)}
            onChange={(e) => onChange(descriptor.key, e.target.value)}
          />
        </div>
      </div>
    );
  }

  return null;
}

export function PropertiesPanel() {
  const scene = useEditorStore((s) => s.scene);
  const updateAscii = useEditorStore((s) => s.updateAscii);
  const addEffect = useEditorStore((s) => s.addEffect);
  const toggleEffect = useEditorStore((s) => s.toggleEffect);
  const removeEffect = useEditorStore((s) => s.removeEffect);
  const updateEffect = useEditorStore((s) => s.updateEffect);
  const updateEffectParams = useEditorStore((s) => s.updateEffectParams);
  const expandedEffects = useEditorStore((s) => s.expandedEffects);
  const toggleExpandEffect = useEditorStore((s) => s.toggleExpandEffect);

  const [addMenuOpen, setAddMenuOpen] = useState(false);

  return (
    <div className="panel properties-panel">
      <div className="panel-section">
        <div className="panel-label">ASCII Settings</div>
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

        <div className="prop-row" style={{ marginTop: 8 }}>
          <span className="prop-label">Blend mode</span>
          <select
            className="effect-select"
            value={scene.ascii.blendMode}
            onChange={(e) => updateAscii({ blendMode: e.target.value })}
          >
            <option value="screen">Screen</option>
            <option value="overlay">Overlay</option>
            <option value="multiply">Multiply</option>
            <option value="normal">Normal</option>
          </select>
        </div>
      </div>

      <div className="panel-section panel-section--effects">
        <div className="panel-label">Effects</div>
        <div className="effects-list">
          {scene.effects.map((fx) => {
            const meta = EFFECT_LABELS[fx.type];
            const isExpanded = expandedEffects.has(fx.id);
            const controls = getControlsForType(fx.type);

            return (
              <div key={fx.id} className={`effect-card ${isExpanded ? "effect-card--expanded" : ""}`}>
                <div
                  className="effect-card-header"
                  onClick={() => toggleExpandEffect(fx.id)}
                >
                  <div className="effect-card-title">
                    <span className="effect-card-caret">
                      {isExpanded ? <CaretDown size={10} /> : <CaretRight size={10} />}
                    </span>
                    <span className="effect-card-icon">{EFFECT_ICONS[fx.type]}</span>
                    <span
                      className="effect-card-name"
                      style={{ color: fx.enabled ? "var(--text-bright)" : "var(--text-dim)" }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div className="effect-card-actions" onClick={(e) => e.stopPropagation()}>
                    <Switch.Root
                      className="switch-root"
                      checked={fx.enabled}
                      onCheckedChange={() => toggleEffect(fx.id)}
                    >
                      <Switch.Thumb className="switch-thumb" />
                    </Switch.Root>
                  </div>
                </div>

                {isExpanded && (
                  <div className="effect-card-body">
                    <div className="effect-card-region">
                      <span className="prop-label">Region</span>
                      <select
                        className="effect-select"
                        value={fx.maskRegion}
                        onChange={(e) =>
                          updateEffect(fx.id, {
                            maskRegion: e.target.value as "foreground" | "background" | "both",
                          })
                        }
                      >
                        <option value="background">Background</option>
                        <option value="foreground">Foreground</option>
                        <option value="both">Both</option>
                      </select>
                    </div>

                    {controls.map((ctrl) => (
                      <EffectControl
                        key={ctrl.key}
                        descriptor={ctrl}
                        value={fx.params[ctrl.key]}
                        onChange={(key, val) => updateEffectParams(fx.id, { [key]: val })}
                      />
                    ))}

                    <button
                      className="effect-remove-btn"
                      onClick={() => removeEffect(fx.id)}
                    >
                      <Trash size={12} />
                      <span>Remove effect</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="add-effect-wrap">
          <button
            className="add-effect-btn"
            onClick={() => setAddMenuOpen(!addMenuOpen)}
          >
            <Plus size={14} />
            <span>Add Effect</span>
          </button>

          {addMenuOpen && (
            <div className="add-effect-menu">
              {ALL_EFFECT_TYPES.map((type) => (
                <button
                  key={type}
                  className="add-effect-option"
                  onClick={() => {
                    addEffect(type);
                    setAddMenuOpen(false);
                  }}
                >
                  <span className="add-effect-option-icon">{EFFECT_ICONS[type]}</span>
                  <span>{EFFECT_LABELS[type].label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
