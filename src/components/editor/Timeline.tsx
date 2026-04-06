"use client";

import { useRef, useCallback } from "react";
import { useEditorStore } from "@/lib/store";
import { EFFECT_LABELS } from "@/engine/effects";
import { SkipBack, Play, Pause, SkipForward, Repeat, RepeatOnce } from "@phosphor-icons/react";

export function Timeline() {
  const scene = useEditorStore((s) => s.scene);
  const playing = useEditorStore((s) => s.playing);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const currentTime = useEditorStore((s) => s.currentTime);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const updatePlayback = useEditorStore((s) => s.updatePlayback);
  const rulerRef = useRef<HTMLDivElement>(null);

  function formatTime(t: number): string {
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(1);
    return `${String(m).padStart(2, "0")}:${s.padStart(4, "0")}`;
  }

  const duration = scene.playback.duration;
  const ticks = Array.from({ length: Math.ceil(duration / 2) + 1 }, (_, i) => i * 2);
  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const seekTo = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const ruler = rulerRef.current;
      if (!ruler) return;
      const rect = ruler.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      setCurrentTime(pct * duration);
    },
    [duration, setCurrentTime]
  );

  function handleRulerMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    seekTo(e);
    const handleMove = (ev: MouseEvent) => {
      const ruler = rulerRef.current;
      if (!ruler) return;
      const rect = ruler.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      setCurrentTime(pct * duration);
    };
    const handleUp = () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }

  function handleSkipBack() {
    setCurrentTime(0);
  }

  function handleSkipForward() {
    setCurrentTime(duration);
    setPlaying(false);
  }

  return (
    <div className="timeline">
      <div className="timeline-controls">
        <button className="timeline-btn" onClick={handleSkipBack} title="Skip to start">
          <SkipBack size={14} weight="fill" />
        </button>
        <button
          className="timeline-btn timeline-btn-play"
          onClick={() => setPlaying(!playing)}
          title={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
        </button>
        <button className="timeline-btn" onClick={handleSkipForward} title="Skip to end">
          <SkipForward size={14} weight="fill" />
        </button>
        <span className="toolbar-sep">|</span>
        <span className="timeline-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <div className="toolbar-spacer" />
        <button
          className="timeline-btn timeline-btn-loop"
          onClick={() => updatePlayback({ loop: !scene.playback.loop })}
          title={scene.playback.loop ? "Loop enabled" : "Play once"}
        >
          {scene.playback.loop ? (
            <Repeat size={14} weight="bold" />
          ) : (
            <RepeatOnce size={14} />
          )}
        </button>
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
          {scene.playback.fps} fps
        </span>
      </div>

      <div className="timeline-tracks">
        <div className="timeline-labels">
          {scene.effects.length === 0 && (
            <div className="timeline-label timeline-label--disabled" style={{ fontStyle: "italic" }}>
              No effects
            </div>
          )}
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
        </div>

        <div className="timeline-bars" ref={rulerRef} onMouseDown={handleRulerMouseDown}>
          {/* Ruler ticks */}
          <div className="timeline-ruler">
            {ticks.map((t) => (
              <span key={t} className="timeline-tick">
                {t}s
              </span>
            ))}
          </div>

          {/* Playhead */}
          <div
            className="timeline-playhead"
            style={{ left: `${playheadPercent}%` }}
          >
            <div className="timeline-playhead-head" />
            <div className="timeline-playhead-line" />
          </div>

          {/* Effect bars */}
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
