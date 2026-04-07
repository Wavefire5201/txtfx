"use client";

import { useRef, useCallback, useState, useEffect } from "react";
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
  const updateEffect = useEditorStore((s) => s.updateEffect);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ id: string; edge: "start" | "end" | "move"; startX: number; origStart: number; origEnd: number | null } | null>(null);

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
    const wasPlaying = playing;
    if (wasPlaying) setPlaying(false);
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
      if (wasPlaying) setPlaying(true);
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

  useEffect(() => {
    if (!dragging) return;
    const ruler = rulerRef.current;
    if (!ruler) return;

    const handleMove = (e: MouseEvent) => {
      const rect = ruler.getBoundingClientRect();
      const deltaX = e.clientX - dragging.startX;
      const deltaPct = deltaX / rect.width;
      const deltaTime = deltaPct * duration;

      if (dragging.edge === "start") {
        const newStart = Math.max(0, Math.min(dragging.origEnd ?? duration, dragging.origStart + deltaTime));
        updateEffect(dragging.id, { timeline: { start: Math.round(newStart * 10) / 10, end: dragging.origEnd, loop: true } });
      } else if (dragging.edge === "end") {
        const newEnd = Math.max(dragging.origStart, Math.min(duration, (dragging.origEnd ?? duration) + deltaTime));
        updateEffect(dragging.id, { timeline: { start: dragging.origStart, end: Math.round(newEnd * 10) / 10, loop: true } });
      }
    };

    const handleUp = () => setDragging(null);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, duration, updateEffect]);

  return (
    <div className="timeline" role="region" aria-label="Timeline">
      <div className="timeline-controls">
        <button className="timeline-btn" onClick={handleSkipBack} title="Skip to start">
          <SkipBack size={14} weight="fill" />
        </button>
        <button
          className="timeline-btn timeline-btn-play"
          onClick={() => setPlaying(!playing)}
          title={playing ? "Pause" : "Play"}
          aria-label={playing ? "Pause" : "Play"}
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
        <span className="toolbar-sep">|</span>
        <span className="timeline-setting">
          <label className="timeline-setting-label">Duration</label>
          <input
            type="number"
            className="timeline-setting-input"
            value={scene.playback.duration}
            min={1}
            max={120}
            step={1}
            onChange={(e) => updatePlayback({ duration: Math.max(1, Number(e.target.value) || 10) })}
          />
          <span className="timeline-setting-unit">s</span>
        </span>
        <span className="timeline-setting">
          <label className="timeline-setting-label">FPS</label>
          <input
            type="number"
            className="timeline-setting-input"
            value={scene.playback.fps}
            min={1}
            max={60}
            step={1}
            onChange={(e) => updatePlayback({ fps: Math.max(1, Math.min(60, Number(e.target.value) || 30)) })}
          />
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
          {scene.effects.map((fx) => {
            const startPct = (fx.timeline.start / duration) * 100;
            const endPct = fx.timeline.end ? (fx.timeline.end / duration) * 100 : 100;
            const widthPct = endPct - startPct;

            return (
              <div key={fx.id} className="timeline-bar">
                <div
                  className={`timeline-bar-fill ${!fx.enabled ? "timeline-bar-fill--disabled" : ""}`}
                  style={{ width: `${widthPct}%`, marginLeft: `${startPct}%` }}
                >
                  <div
                    className="timeline-bar-handle timeline-bar-handle--start"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      const startX = e.clientX;
                      setDragging({ id: fx.id, edge: "start", startX, origStart: fx.timeline.start, origEnd: fx.timeline.end });
                    }}
                  />
                  <div
                    className="timeline-bar-handle timeline-bar-handle--end"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      const startX = e.clientX;
                      setDragging({ id: fx.id, edge: "end", startX, origStart: fx.timeline.start, origEnd: fx.timeline.end });
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
