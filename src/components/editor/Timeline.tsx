"use client";

import { useEditorStore } from "@/lib/store";
import { EFFECT_LABELS } from "@/engine/effects";
import { SkipBack, Play, Pause, SkipForward } from "@phosphor-icons/react";

export function Timeline() {
  const scene = useEditorStore((s) => s.scene);
  const playing = useEditorStore((s) => s.playing);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const currentTime = useEditorStore((s) => s.currentTime);

  function formatTime(t: number): string {
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(2);
    return `${String(m).padStart(2, "0")}:${s.padStart(5, "0")}`;
  }

  const duration = scene.playback.duration;
  const ticks = Array.from({ length: Math.ceil(duration / 2) + 1 }, (_, i) => i * 2);

  return (
    <div className="timeline">
      <div className="timeline-controls">
        <button className="timeline-btn" onClick={() => setPlaying(false)}>
          <SkipBack size={14} weight="fill" />
        </button>
        <button
          className="timeline-btn timeline-btn-play"
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
        </button>
        <button className="timeline-btn">
          <SkipForward size={14} weight="fill" />
        </button>
        <span className="toolbar-sep">|</span>
        <span className="timeline-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <div className="toolbar-spacer" />
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {scene.playback.fps} fps
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {scene.playback.loop ? "Loop" : "Once"}
        </span>
      </div>

      <div className="timeline-tracks">
        <div className="timeline-labels">
          {scene.effects.map((fx) => {
            const meta = EFFECT_LABELS[fx.type];
            return (
              <div
                key={fx.id}
                className={`timeline-label ${!fx.enabled ? "timeline-label--disabled" : ""}`}
              >
                {meta.label}
              </div>
            );
          })}
          {scene.effects.length === 0 && (
            <div className="timeline-label timeline-label--disabled" style={{ fontStyle: "italic" }}>
              No effects
            </div>
          )}
        </div>

        <div className="timeline-bars">
          <div
            style={{
              display: "flex",
              fontSize: 9,
              color: "var(--text-muted)",
              padding: "2px 0",
              borderBottom: "1px solid var(--bg-input)",
            }}
          >
            {ticks.map((t) => (
              <span key={t} style={{ flex: 1, textAlign: "center" }}>
                {t}s
              </span>
            ))}
          </div>
          {scene.effects.map((fx) => (
            <div key={fx.id} className="timeline-bar">
              <div
                className={`timeline-bar-fill ${!fx.enabled ? "timeline-bar-fill--disabled" : ""}`}
                style={{
                  width: fx.timeline.end
                    ? `${((fx.timeline.end - fx.timeline.start) / duration) * 100}%`
                    : "100%",
                  marginLeft: `${(fx.timeline.start / duration) * 100}%`,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
