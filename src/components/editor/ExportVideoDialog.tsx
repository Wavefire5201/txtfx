"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  computeVideoDimensions,
  videoBitrateFor,
  VIDEO_HEIGHT_CHOICES,
  VIDEO_FPS_CHOICES,
  VIDEO_MIN_HEIGHT,
  VIDEO_MAX_HEIGHT,
} from "@/engine/export/presets";
import { formatBytes } from "@/engine/export/diagnostics";

interface ExportVideoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Source image natural size — output aspect follows it. */
  imageWidth: number;
  imageHeight: number;
  durationSec: number;
  onExport: (options: { width: number; height: number; fps: number; videoBitsPerSecond: number }) => void;
}

const choiceStyle = (active: boolean): React.CSSProperties => ({
  padding: "4px 10px",
  borderRadius: 6,
  border: `1px solid ${active ? "var(--accent, #7defa0)" : "var(--border, #333)"}`,
  background: active ? "rgba(125, 239, 160, 0.12)" : "transparent",
  color: active ? "var(--accent, #7defa0)" : "inherit",
  cursor: "pointer",
  font: "inherit",
});

export function ExportVideoDialog({
  open,
  onOpenChange,
  imageWidth,
  imageHeight,
  durationSec,
  onExport,
}: ExportVideoDialogProps) {
  const [targetHeight, setTargetHeight] = useState<number>(1080);
  const [customHeight, setCustomHeight] = useState("");
  const [fps, setFps] = useState<number>(30);

  const usingCustom = customHeight !== "";
  const parsedCustom = Number.parseInt(customHeight, 10);
  const effectiveHeight = usingCustom && Number.isFinite(parsedCustom) ? parsedCustom : targetHeight;
  const { width, height } = computeVideoDimensions(imageWidth, imageHeight, effectiveHeight);
  const bitrate = videoBitrateFor(width, height, fps);
  const estimatedBytes = (bitrate / 8) * durationSec;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="confirm-overlay" />
        <Dialog.Content className="confirm-content">
          <Dialog.Title className="confirm-title">Export WebM</Dialog.Title>
          <Dialog.Description className="confirm-desc">
            Output follows the image aspect ratio. Dimensions are rounded to
            encoder-safe even values.
          </Dialog.Description>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "12px 0" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ opacity: 0.7, minWidth: 72 }}>Resolution</span>
              {VIDEO_HEIGHT_CHOICES.map((h) => (
                <button
                  key={h}
                  style={choiceStyle(!usingCustom && targetHeight === h)}
                  onClick={() => {
                    setTargetHeight(h);
                    setCustomHeight("");
                  }}
                >
                  {h}p
                </button>
              ))}
              <input
                type="number"
                min={VIDEO_MIN_HEIGHT}
                max={VIDEO_MAX_HEIGHT}
                placeholder="custom"
                value={customHeight}
                onChange={(e) => setCustomHeight(e.target.value)}
                style={{
                  width: 72,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: `1px solid ${usingCustom ? "var(--accent, #7defa0)" : "var(--border, #333)"}`,
                  background: "transparent",
                  color: "inherit",
                  font: "inherit",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ opacity: 0.7, minWidth: 72 }}>FPS</span>
              {VIDEO_FPS_CHOICES.map((f) => (
                <button key={f} style={choiceStyle(fps === f)} onClick={() => setFps(f)}>
                  {f}
                </button>
              ))}
            </div>

            <div style={{ opacity: 0.65, fontSize: "0.92em" }}>
              {width} × {height} @ {fps}fps · ~{formatBytes(estimatedBytes)} for {durationSec}s
            </div>
          </div>

          <div className="confirm-actions">
            <button className="confirm-btn confirm-btn--cancel" onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button
              className="confirm-btn confirm-btn--confirm"
              onClick={() => {
                onExport({ width, height, fps, videoBitsPerSecond: bitrate });
                onOpenChange(false);
              }}
            >
              Export
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
