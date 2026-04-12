"use client";

import { useState } from "react";
import * as Switch from "@radix-ui/react-switch";
import * as Slider from "@radix-ui/react-slider";
import { useEditorStore } from "@/lib/store";
import { createEffect, EFFECT_LABELS, type EffectType } from "@/engine/effects";
import type { ControlDescriptor } from "@/engine/effects/types";
import { toast } from "./Toast";
import { ConfirmDialog } from "./ConfirmDialog";
import { Select } from "./Select";

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `${f(0)}${f(8)}${f(4)}`;
}

function getPresets(type: string): Record<string, Record<string, unknown>> {
  try {
    const saved = localStorage.getItem(`txtfx-presets-${type}`);
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
}

function savePreset(type: string, name: string, params: Record<string, unknown>) {
  const presets = getPresets(type);
  presets[name] = { ...params };
  localStorage.setItem(`txtfx-presets-${type}`, JSON.stringify(presets));
}

function deletePreset(type: string, name: string) {
  const presets = getPresets(type);
  delete presets[name];
  localStorage.setItem(`txtfx-presets-${type}`, JSON.stringify(presets));
}
import {
  CaretDown,
  CaretRight,
  CaretLeft,
  Trash,
  Plus,
  Sparkle,
  Drop,
  Flame,
  Snowflake,
  Lightning,
  ShootingStar,
  CloudRain,
  Monitor,
  Keyboard,
  Terminal,
  Fire,
  Gear,
  DotsSixVertical,
  X,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";

const ALL_EFFECT_TYPES: EffectType[] = [
  "twinkle", "meteor", "rain", "snow", "fire", "matrix",
  "scanline", "glitch", "typewriter", "decode", "firework", "custom-emitter",
];

const EFFECT_ICONS: Record<EffectType, React.ReactNode> = {
  twinkle: <Sparkle size={14} />,
  meteor: <ShootingStar size={14} />,
  rain: <CloudRain size={14} />,
  snow: <Snowflake size={14} />,
  fire: <Flame size={14} />,
  matrix: <Terminal size={14} />,
  scanline: <Monitor size={14} />,
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
    const isInt = Number.isInteger(descriptor.step ?? 1);
    const displayVal = isInt ? String(numVal) : numVal.toFixed(2);
    const isDefault = numVal === Number(descriptor.defaultValue);
    return (
      <div className="effect-control">
        <div className="prop-row">
          <span className="prop-label">{descriptor.label}</span>
          <span className="prop-value-group">
            {!isDefault && (
              <button
                className="prop-reset-btn"
                title="Reset to default"
                onClick={() => onChange(descriptor.key, descriptor.defaultValue)}
              >
                <ArrowCounterClockwise size={11} />
              </button>
            )}
            <input
              className="prop-value prop-value--input"
              type="text"
              inputMode="decimal"
              value={displayVal}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n)) {
                  const clamped = Math.max(descriptor.min ?? 0, Math.min(descriptor.max ?? 100, n));
                  onChange(descriptor.key, clamped);
                }
              }}
            />
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
          <Select
            value={String(current)}
            onChange={(v) => onChange(descriptor.key, v)}
            options={descriptor.options}
          />
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

  if (descriptor.type === "color") {
    const colorVal = typeof current === "string" ? current : String(descriptor.defaultValue);
    return (
      <div className="effect-control">
        <div className="prop-row">
          <span className="prop-label">{descriptor.label}</span>
          <input
            type="color"
            className="effect-color-input"
            value={colorVal}
            onChange={(e) => onChange(descriptor.key, e.target.value)}
          />
        </div>
      </div>
    );
  }

  if (descriptor.type === "colors") {
    const colorList = Array.isArray(current) ? current as string[] : [String(current)];
    return (
      <div className="effect-control">
        <div className="prop-row">
          <span className="prop-label">{descriptor.label}</span>
        </div>
        <div className="color-list">
          {colorList.map((c, i) => (
            <div key={i} className="color-swatch-wrap">
              <input
                type="color"
                className="color-swatch"
                value={c}
                onChange={(e) => {
                  const next = [...colorList];
                  next[i] = e.target.value;
                  onChange(descriptor.key, next);
                }}
              />
              {colorList.length > 1 && (
                <button
                  className="color-remove"
                  title="Remove color"
                  onClick={() => {
                    onChange(descriptor.key, colorList.filter((_, j) => j !== i));
                  }}
                >
                  <X size={8} weight="bold" />
                </button>
              )}
            </div>
          ))}
          <button
            className="color-add"
            title="Add color"
            onClick={() => {
              const hue = Math.floor(Math.random() * 360);
              const hex = `#${hslToHex(hue, 80, 60)}`;
              onChange(descriptor.key, [...colorList, hex]);
            }}
          >
            <Plus size={12} weight="bold" />
          </button>
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
  const reorderEffect = useEditorStore((s) => s.reorderEffect);
  const collapsed = useEditorStore((s) => s.rightPanelCollapsed);
  const toggleCollapsed = useEditorStore((s) => s.toggleRightPanel);

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [presetVersion, setPresetVersion] = useState(0);
  const [clearOpen, setClearOpen] = useState(false);
  const [presetInput, setPresetInput] = useState<{ effectType: string; effectId: string; params: Record<string, unknown> } | null>(null);
  const [presetName, setPresetName] = useState("");

  if (collapsed) {
    return (
      <div className="panel panel--collapsed panel--collapsed-right" role="complementary" aria-label="Effect properties">
        <button
          className="panel-collapse-btn"
          onClick={toggleCollapsed}
          title="Expand panel"
          aria-label="Expand properties panel"
        >
          <CaretLeft size={12} />
        </button>
        <span className="panel-collapsed-label">Properties</span>
      </div>
    );
  }

  return (
    <div className="panel properties-panel" role="complementary" aria-label="Effect properties">
      <div className="panel-section">
        <div className="panel-label">
          <span>ASCII Settings</span>
          <button
            className="panel-collapse-btn"
            onClick={toggleCollapsed}
            title="Collapse panel"
            aria-label="Collapse properties panel"
          >
            <CaretRight size={12} />
          </button>
        </div>
        <div className="prop-row">
          <span className="prop-label">Opacity</span>
          <span className="prop-value-group">
            {scene.ascii.opacity !== 0.38 && (
              <button className="prop-reset-btn" title="Reset to default" onClick={() => updateAscii({ opacity: 0.38 })}>
                <ArrowCounterClockwise size={11} />
              </button>
            )}
            <input
              className="prop-value prop-value--input"
              type="text"
              value={`${Math.round(scene.ascii.opacity * 100)}%`}
              onChange={(e) => {
                const n = parseInt(e.target.value);
                if (!Number.isNaN(n)) updateAscii({ opacity: Math.max(0, Math.min(100, n)) / 100 });
              }}
            />
          </span>
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
          <Select
            value={scene.ascii.blendMode}
            onChange={(v) => updateAscii({ blendMode: v })}
            options={[
              { label: "Screen", value: "screen" },
              { label: "Overlay", value: "overlay" },
              { label: "Multiply", value: "multiply" },
              { label: "Normal", value: "normal" },
            ]}
          />
        </div>

        <div className="prop-row" style={{ marginTop: 8 }}>
          <span className="prop-label">Char ramp</span>
        </div>
        <input
          className="effect-text-input"
          style={{ width: "100%", fontFamily: "monospace", fontSize: 11, marginTop: 4 }}
          type="text"
          value={scene.ascii.ramp}
          onChange={(e) => updateAscii({ ramp: e.target.value })}
          title="Characters from dark to light"
        />

        {(() => {
          const fsVal = parseFloat(scene.ascii.fontSize) || 0.85;
          const fsUnit = scene.ascii.fontSize.replace(/[\d.]/g, "") || "vw";
          const sliderRange = fsUnit === "px"
            ? { min: 6, max: 32, step: 1 }
            : { min: 0.4, max: 2, step: 0.05 };
          return (
            <>
              <div className="prop-row" style={{ marginTop: 8 }}>
                <span className="prop-label">Font size</span>
                <span className="prop-value-group">
                  {scene.ascii.fontSize !== "0.85vw" && (
                    <button
                      className="prop-reset-btn"
                      title="Reset to default"
                      onClick={() => updateAscii({ fontSize: "0.85vw" })}
                    >
                      <ArrowCounterClockwise size={11} />
                    </button>
                  )}
                  <input
                    className="prop-value prop-value--input"
                    type="text"
                    value={fsUnit === "px" ? String(Math.round(fsVal)) : fsVal.toFixed(2)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isNaN(n) && n >= sliderRange.min && n <= sliderRange.max) {
                        updateAscii({ fontSize: `${n}${fsUnit}` });
                      }
                    }}
                  />
                  <Select
                    value={fsUnit}
                    onChange={(u) => updateAscii({ fontSize: `${u === "px" ? 12 : 0.85}${u}` })}
                    options={[
                      { label: "vw", value: "vw" },
                      { label: "px", value: "px" },
                    ]}
                  />
                </span>
              </div>
              <Slider.Root
                className="slider-root"
                value={[fsVal]}
                min={sliderRange.min}
                max={sliderRange.max}
                step={sliderRange.step}
                onValueChange={([v]) => updateAscii({ fontSize: `${v}${fsUnit}` })}
              >
                <Slider.Track className="slider-track">
                  <Slider.Range className="slider-range" />
                </Slider.Track>
                <Slider.Thumb className="slider-thumb" />
              </Slider.Root>
            </>
          );
        })()}
      </div>

      <div className="panel-section panel-section--effects">
        <div className="panel-label">Effects</div>
        <div className="effects-list">
          {scene.effects.map((fx, idx) => {
            const meta = EFFECT_LABELS[fx.type];
            const isExpanded = expandedEffects.has(fx.id);
            const controls = getControlsForType(fx.type);

            return (
              <div
                key={fx.id}
                className={`effect-card ${isExpanded ? "effect-card--expanded" : ""} ${dragOverIndex === idx ? "effect-card--drag-over" : ""}`}
                draggable
                onDragStart={(e) => { setDragIndex(idx); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(idx); }}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={() => { if (dragIndex !== null && dragIndex !== idx) reorderEffect(dragIndex, idx); setDragIndex(null); setDragOverIndex(null); }}
                onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
              >
                <div
                  className="effect-card-header"
                  onClick={() => toggleExpandEffect(fx.id)}
                >
                  <div className="effect-card-title">
                    <span className="effect-card-drag" onMouseDown={(e) => e.stopPropagation()}>
                      <DotsSixVertical size={12} weight="bold" />
                    </span>
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
                    <button
                      className="effect-card-remove"
                      onClick={() => removeEffect(fx.id)}
                      title="Remove effect"
                      aria-label="Remove effect"
                    >
                      <Trash size={12} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="effect-card-body">
                    <div className="effect-card-region">
                      <span className="prop-label">Region</span>
                      <Select
                        value={fx.maskRegion}
                        onChange={(v) => updateEffect(fx.id, { maskRegion: v as "foreground" | "background" | "both" })}
                        options={[
                          { label: "Background", value: "background" },
                          { label: "Foreground", value: "foreground" },
                          { label: "Both", value: "both" },
                        ]}
                      />
                    </div>

                    <div className="effect-card-region">
                      <span className="prop-label">Apply to ASCII</span>
                      <Switch.Root
                        className="switch-root"
                        checked={fx.applyToAscii ?? false}
                        onCheckedChange={(checked) =>
                          updateEffect(fx.id, { applyToAscii: checked })
                        }
                      >
                        <Switch.Thumb className="switch-thumb" />
                      </Switch.Root>
                    </div>

                    <div className="effect-card-region">
                      <span className="prop-label">Mode</span>
                      <Select
                        value={fx.timeline.mode ?? "continuous"}
                        onChange={(v) => updateEffect(fx.id, { timeline: { ...fx.timeline, mode: v as "continuous" | "one-shot" } })}
                        options={[
                          { label: "Continuous", value: "continuous" },
                          { label: "One-shot", value: "one-shot" },
                        ]}
                      />
                    </div>

                    {controls.map((ctrl) => (
                      <EffectControl
                        key={ctrl.key}
                        descriptor={ctrl}
                        value={fx.params[ctrl.key]}
                        onChange={(key, val) => updateEffectParams(fx.id, { [key]: val })}
                      />
                    ))}

                    <div className="effect-presets">
                      <div className="prop-row" style={{ marginTop: 8 }}>
                        <span className="prop-label">Presets</span>
                        <button
                          className="preset-save-btn"
                          onClick={() => {
                            setPresetInput({ effectType: fx.type, effectId: fx.id, params: fx.params });
                            setPresetName("");
                          }}
                        >
                          Save
                        </button>
                      </div>
                      {Object.keys(getPresets(fx.type)).length > 0 && (
                        <div className="preset-list">
                          {Object.entries(getPresets(fx.type)).map(([name, params]) => (
                            <div key={name} className="preset-item">
                              <button
                                className="preset-load-btn"
                                onClick={() => {
                                  updateEffectParams(fx.id, params);
                                  toast(`Loaded "${name}"`);
                                }}
                              >
                                {name}
                              </button>
                              <button
                                className="preset-delete-btn"
                                title="Delete preset"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deletePreset(fx.type, name);
                                  setPresetVersion((v) => v + 1);
                                  toast(`Deleted "${name}"`);
                                }}
                              >
                                <X size={8} weight="bold" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="add-effect-wrap">
          <div className="add-effect-row">
            <button
              className="add-effect-btn"
              onClick={() => setAddMenuOpen(!addMenuOpen)}
            >
              <Plus size={16} weight="bold" />
              <span>Add Effect</span>
            </button>
            {scene.effects.length > 0 && (
              <button
                className="clear-effects-btn"
                onClick={() => setClearOpen(true)}
                title="Clear all effects"
              >
                <Trash size={14} />
              </button>
            )}
          </div>

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

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear all effects"
        description="This will remove all effects from the scene. This action cannot be undone."
        confirmLabel="Clear All"
        onConfirm={() => {
          useEditorStore.getState().clearEffects();
          toast("All effects removed");
        }}
      />

      {presetInput && (
        <div className="confirm-overlay" onClick={() => setPresetInput(null)}>
          <div className="confirm-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirm-title">Save Preset</h3>
            <p className="confirm-desc">Enter a name for this preset.</p>
            <input
              className="preset-name-input"
              type="text"
              placeholder="Preset name"
              value={presetName}
              autoFocus
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && presetName.trim()) {
                  savePreset(presetInput.effectType, presetName.trim(), presetInput.params);
                  setPresetVersion((v) => v + 1);
                  toast(`Preset "${presetName.trim()}" saved`);
                  setPresetInput(null);
                }
                if (e.key === "Escape") setPresetInput(null);
              }}
            />
            <div className="confirm-actions">
              <button className="confirm-btn confirm-btn--cancel" onClick={() => setPresetInput(null)}>Cancel</button>
              <button
                className="confirm-btn confirm-btn--confirm"
                disabled={!presetName.trim()}
                style={{ background: presetName.trim() ? "var(--accent-bg)" : undefined, borderColor: presetName.trim() ? "var(--accent)" : undefined, color: presetName.trim() ? "var(--accent)" : "var(--text-dim)" }}
                onClick={() => {
                  if (presetName.trim()) {
                    savePreset(presetInput.effectType, presetName.trim(), presetInput.params);
                    setPresetVersion((v) => v + 1);
                    toast(`Preset "${presetName.trim()}" saved`);
                    setPresetInput(null);
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
