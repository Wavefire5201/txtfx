"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useEditorStore } from "@/lib/store";
import { exportStandaloneHTML } from "@/engine/export/html";
import { exportEmbedSnippet } from "@/engine/export/embed";
import { exportGifAuto, exportStillAuto, exportWebMAuto } from "@/engine/export/client";
import {
  resolveGifPreset,
  resolveStillPreset,
  resolveVideoPreset,
  computeVideoDimensions,
  type GifPresetId,
  type StillPresetId,
  type VideoPresetId,
} from "@/engine/export/presets";
import { formatBytes, type ExportMetrics } from "@/engine/export/diagnostics";
import { type SceneData, createDefaultScene } from "@/engine/scene";
import { Mask } from "@/engine/mask";
import { clearState } from "@/lib/cache";
import { uploadImageToR2 } from "@/lib/image-upload";
import { toast } from "./Toast";
import { ConfirmDialog } from "./ConfirmDialog";
import { ExportVideoDialog } from "./ExportVideoDialog";
import {
  FolderOpen,
  Export,
  FileHtml,
  Code,
  FileArrowDown,
  FileArrowUp,
  Share,
  CaretDown,
  ArrowCounterClockwise,
  ArrowClockwise,
  Trash,
  Sun,
  Moon,
  FilmStrip,
  VideoCamera,
} from "@phosphor-icons/react";

function logExportMetrics(m: ExportMetrics) {
  console.info(
    `[txtfx export] ${m.format} ${m.width}x${m.height} · ${m.frameCount} frames in ` +
      `${Math.round(m.elapsedMs ?? 0)}ms (${(m.msPerFrame ?? 0).toFixed(1)}ms/frame) · ${formatBytes(m.bytes)}`,
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Toolbar() {
  const fileRef = useRef<HTMLInputElement>(null);
  const sceneFileRef = useRef<HTMLInputElement>(null);
  const setImageUrl = useEditorStore((s) => s.setImageUrl);
  const setScene = useEditorStore((s) => s.setScene);
  const scene = useEditorStore((s) => s.scene);
  const imageUrl = useEditorStore((s) => s.imageUrl);
  const mask = useEditorStore((s) => s.mask);
  const maskFeather = useEditorStore((s) => s.maskFeather);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const [exportOpen, setExportOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  // Set when the custom WebM dialog is open (holds image natural size for aspect)
  const [videoDialog, setVideoDialog] = useState<{ w: number; h: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const exportAbortRef = useRef<AbortController | null>(null);
  const [sharing, setSharing] = useState(false);
  const [lightMode, setLightMode] = useState(false);
  const [modKey, setModKey] = useState("Ctrl");
  useEffect(() => {
    const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
    setModKey(isMac ? "⌘" : "Ctrl");
  }, []);

  function toggleTheme() {
    const next = !lightMode;
    setLightMode(next);
    document.documentElement.classList.toggle("light-mode", next);
  }

  function getExportScene(): SceneData {
    return {
      ...scene,
      image: {
        ...scene.image,
        data: imageUrl || "",
      },
      mask: {
        data: mask ? mask.toBase64() : "",
        feather: maskFeather,
      },
    };
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageUrl(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleOpenScene(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!data.version) { toast("Invalid scene file", "warning"); return; }
        // Extract image from scene data if present
        if (data.image?.data) {
          setImageUrl(data.image.data);
        }
        setScene(data);
        // Restore mask if present
        if (data.mask?.data && data.image?.width) {
          const restored = await Mask.fromBase64(data.mask.data, data.image.width, data.image.height);
          useEditorStore.getState().setMask(restored);
          useEditorStore.getState().bumpMaskVersion();
        }
        toast("Scene loaded");
      } catch {
        toast("Could not parse scene file", "warning");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleReset() {
    setScene(createDefaultScene());
    setImageUrl("");
    clearState();
    const store = useEditorStore.getState();
    store.setZoom(1);
    store.setPan(0, 0);
    store.setPlaying(false);
    store.setCurrentTime(0);
    toast("Canvas reset");
  }

  function handleExportJSON() {
    const blob = new Blob([JSON.stringify(getExportScene(), null, 2)], { type: "application/json" });
    downloadBlob(blob, `txtfx-${new Date().toISOString().slice(0, 10)}.txtfx`);
    setExportOpen(false);
    toast("Scene exported as JSON");
  }

  async function handleExportHTML() {
    setExporting(true);
    setExportOpen(false);
    await new Promise(r => setTimeout(r, 0));
    const html = exportStandaloneHTML(getExportScene());
    const blob = new Blob([html], { type: "text/html" });
    downloadBlob(blob, `txtfx-${new Date().toISOString().slice(0, 10)}.html`);
    setExporting(false);
    toast("Exported as standalone HTML");
  }

  async function handleExportEmbed() {
    setExporting(true);
    setExportOpen(false);
    await new Promise(r => setTimeout(r, 0));
    const snippet = exportEmbedSnippet(getExportScene());
    navigator.clipboard.writeText(snippet).then(() => {
      toast("Embed snippet copied to clipboard");
    }).catch(() => {
      toast("Could not copy to clipboard", "warning");
    });
    setExporting(false);
  }

  function cancelExport() {
    exportAbortRef.current?.abort();
  }

  function isAbortError(err: unknown): boolean {
    return err instanceof DOMException && err.name === "AbortError";
  }

  async function loadExportImage(): Promise<HTMLImageElement> {
    if (!imageUrl) {
      toast("Add an image first", "warning");
      throw new Error("Missing image");
    }
    const img = new Image();
    img.src = imageUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
    });
    return img;
  }

  function targetSize(img: HTMLImageElement, targetHeight: number) {
    const aspectRatio = img.naturalWidth / img.naturalHeight;
    const height = targetHeight;
    const width = Math.round(height * aspectRatio);
    return { width, height };
  }

  function beginExport() {
    setExportOpen(false);
    setExporting(true);
    setExportProgress(0);
    const controller = new AbortController();
    exportAbortRef.current = controller;
    return controller;
  }

  function endExport() {
    exportAbortRef.current = null;
    setExporting(false);
    setExportProgress(0);
  }

  async function handleExportStill(presetId: StillPresetId) {
    const preset = resolveStillPreset(presetId);
    const controller = beginExport();
    await new Promise((r) => setTimeout(r, 0));
    try {
      const img = await loadExportImage();
      const { width, height } = targetSize(img, preset.targetHeight);
      const currentMask = useEditorStore.getState().mask;
      const blob = await exportStillAuto(getExportScene(), img, currentMask, {
        width,
        height,
        type: preset.type,
        quality: preset.quality,
        transparent: preset.transparent,
        signal: controller.signal,
      });
      downloadBlob(blob, `txtfx-${new Date().toISOString().slice(0, 10)}.png`);
      toast(`${preset.label} exported (${formatBytes(blob.size)})`);
    } catch (err) {
      if (isAbortError(err)) {
        toast("Export cancelled");
      } else if ((err as Error).message !== "Missing image") {
        console.error("Still export failed:", err);
        toast("Still export failed", "warning");
      }
    } finally {
      endExport();
    }
  }

  async function handleExportGif(presetId: GifPresetId) {
    const preset = resolveGifPreset(presetId);
    const controller = beginExport();
    await new Promise((r) => setTimeout(r, 0));
    try {
      const img = await loadExportImage();
      const { width, height } = targetSize(img, preset.targetHeight);
      const currentMask = useEditorStore.getState().mask;
      const blob = await exportGifAuto(getExportScene(), img, currentMask, {
        width,
        height,
        fps: preset.fps,
        maxColors: preset.maxColors,
        maxDuration: preset.maxDuration,
        paletteMode: preset.paletteMode,
        colorFormat: preset.colorFormat,
        prequantize: preset.prequantize,
        signal: controller.signal,
        onProgress: (pct) => setExportProgress(Math.round(pct * 100)),
        onMetrics: logExportMetrics,
      });
      downloadBlob(blob, `txtfx-${new Date().toISOString().slice(0, 10)}.gif`);
      toast(`${preset.label} exported (${formatBytes(blob.size)})`);
    } catch (err) {
      if (isAbortError(err)) {
        toast("Export cancelled");
      } else if ((err as Error).message !== "Missing image") {
        console.error("GIF export failed:", err);
        toast("GIF export failed", "warning");
      }
    } finally {
      endExport();
    }
  }

  interface WebMRunOptions {
    fps: number;
    videoBitsPerSecond: number;
    /** Explicit dimensions (custom dialog) — otherwise derived from targetHeight. */
    width?: number;
    height?: number;
    targetHeight?: number;
  }

  async function runWebMExport(label: string, opts: WebMRunOptions) {
    const controller = beginExport();
    await new Promise((r) => setTimeout(r, 0));
    try {
      const img = await loadExportImage();
      const { width, height } =
        opts.width && opts.height
          ? { width: opts.width, height: opts.height }
          : computeVideoDimensions(img.naturalWidth, img.naturalHeight, opts.targetHeight ?? 720);
      const currentMask = useEditorStore.getState().mask;
      const { blob, ext } = await exportWebMAuto(getExportScene(), img, currentMask, {
        width,
        height,
        fps: opts.fps,
        videoBitsPerSecond: opts.videoBitsPerSecond,
        signal: controller.signal,
        onProgress: (pct) => setExportProgress(Math.round(pct * 100)),
        onMetrics: logExportMetrics,
      });
      downloadBlob(blob, `txtfx-${new Date().toISOString().slice(0, 10)}.${ext}`);
      toast(`${label} exported (${formatBytes(blob.size)})`);
    } catch (err) {
      if (isAbortError(err)) {
        toast("Export cancelled");
      } else if ((err as Error).message !== "Missing image") {
        console.error("WebM export failed:", err);
        toast("Video export failed", "warning");
      }
    } finally {
      endExport();
    }
  }

  function handleExportWebM(presetId: VideoPresetId) {
    const preset = resolveVideoPreset(presetId);
    void runWebMExport(preset.label, {
      fps: preset.fps,
      videoBitsPerSecond: preset.videoBitsPerSecond,
      targetHeight: preset.targetHeight,
    });
  }

  async function openVideoDialog() {
    setExportOpen(false);
    try {
      const img = await loadExportImage();
      setVideoDialog({ w: img.naturalWidth, h: img.naturalHeight });
    } catch {
      // loadExportImage already toasted "Add an image first"
    }
  }

  async function handleShare() {
    if (sharing) return; // prevent double-clicks
    try {
      if (!imageUrl) {
        toast("Add an image first", "warning");
        return;
      }

      setSharing(true);
      toast("Uploading image...");

      // 1. Upload image to R2 (compresses + dedupes via hash)
      let uploaded: { publicUrl: string; hash: string };
      try {
        uploaded = await uploadImageToR2(imageUrl);
      } catch (err) {
        console.error("Image upload failed:", err);
        toast("Image upload failed", "warning");
        return;
      }

      // 2. Build scene without the embedded image data (R2 holds it now)
      const sceneToShare = {
        ...getExportScene(),
        image: {
          ...scene.image,
          data: "", // no embedded data URL in the shared scene JSON
        },
      };

      // 3. POST scene metadata + image URL/hash reference
      const res = await fetch("/api/scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene: sceneToShare,
          imageUrl: uploaded.publicUrl,
          imageHash: uploaded.hash,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to create share link" }));
        toast(err.error || "Failed to create share link", "warning");
        return;
      }
      const { id } = await res.json();
      const url = `${window.location.origin}/s/${id}`;
      await navigator.clipboard.writeText(url);
      toast("Share link copied to clipboard");
    } catch (err) {
      console.error("Share failed:", err);
      toast("Failed to create share link", "warning");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="toolbar">
      <span className="toolbar-logo">txtfx</span>
      <span className="toolbar-sep">|</span>

      <button className="toolbar-item" onClick={() => fileRef.current?.click()}>
        <FolderOpen size={14} style={{ marginRight: 4 }} />
        Open Image
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />

      <button className="toolbar-item" onClick={() => sceneFileRef.current?.click()}>
        <FileArrowUp size={14} style={{ marginRight: 4 }} />
        Open Scene
      </button>
      <input ref={sceneFileRef} type="file" accept=".txtfx,.json" hidden onChange={handleOpenScene} />

      <span className="toolbar-sep">|</span>
      <button className="toolbar-item" onClick={undo} disabled={!canUndo} title={`Undo (${modKey}+Z)`} suppressHydrationWarning>
        <ArrowCounterClockwise size={14} />
      </button>
      <button className="toolbar-item" onClick={redo} disabled={!canRedo} title={`Redo (${modKey}+Shift+Z)`} suppressHydrationWarning>
        <ArrowClockwise size={14} />
      </button>
      <button className="toolbar-item" onClick={() => setResetOpen(true)} title="Reset canvas">
        <Trash size={14} />
      </button>
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset canvas"
        description="This will clear all effects, settings, and the current image. This action cannot be undone."
        confirmLabel="Reset"
        onConfirm={handleReset}
      />

      <div className="toolbar-dropdown-wrap">
        <button
          className="toolbar-item"
          onClick={exporting ? cancelExport : () => setExportOpen(!exportOpen)}
        >
          <Export size={14} style={{ marginRight: 4 }} />
          {exporting ? `Cancel export${exportProgress > 0 ? ` ${exportProgress}%` : ""}` : "Export"}
          {!exporting && <CaretDown size={10} style={{ marginLeft: 4, opacity: 0.5 }} />}
        </button>

        {exportOpen && (
          <>
            <div className="toolbar-dropdown-backdrop" onClick={() => setExportOpen(false)} />
            <div className="toolbar-dropdown">
              <button className="toolbar-dropdown-item" onClick={handleExportJSON}>
                <FileArrowDown size={14} />
                <span>Scene JSON (.txtfx)</span>
              </button>
              <button className="toolbar-dropdown-item" onClick={handleExportHTML}>
                <FileHtml size={14} />
                <span>Standalone HTML</span>
              </button>
              <button className="toolbar-dropdown-item" onClick={handleExportEmbed}>
                <Code size={14} />
                <span>Copy embed snippet</span>
              </button>
              <div className="toolbar-dropdown-divider" />
              <button className="toolbar-dropdown-item" onClick={() => handleExportStill("standard")}>
                <FileArrowDown size={14} />
                <span>PNG Still (1080p)</span>
              </button>
              <button className="toolbar-dropdown-item" onClick={() => handleExportStill("transparent")}>
                <FileArrowDown size={14} />
                <span>Transparent overlay</span>
              </button>
              <div className="toolbar-dropdown-divider" />
              <button className="toolbar-dropdown-item" onClick={() => handleExportGif("preview")}>
                <FilmStrip size={14} />
                <span>GIF Preview (small)</span>
              </button>
              <button className="toolbar-dropdown-item" onClick={() => handleExportGif("balanced")}>
                <FilmStrip size={14} />
                <span>GIF Balanced</span>
              </button>
              <button className="toolbar-dropdown-item" onClick={() => handleExportGif("quality")}>
                <FilmStrip size={14} />
                <span>GIF Quality</span>
              </button>
              <button className="toolbar-dropdown-item" onClick={() => handleExportWebM("balanced")}>
                <VideoCamera size={14} />
                <span>WebM Balanced</span>
              </button>
              <button className="toolbar-dropdown-item" onClick={() => handleExportWebM("high")}>
                <VideoCamera size={14} />
                <span>WebM High Quality</span>
              </button>
              <button className="toolbar-dropdown-item" onClick={openVideoDialog}>
                <VideoCamera size={14} />
                <span>WebM Custom…</span>
              </button>
            </div>
          </>
        )}
      </div>

      <div className="toolbar-spacer" />

      <Link href="/docs" className="toolbar-item" target="_blank" title="Documentation">
        Docs
      </Link>
      <button className="toolbar-item" onClick={toggleTheme} title={lightMode ? "Dark mode" : "Light mode"}>
        {lightMode ? <Moon size={14} /> : <Sun size={14} />}
      </button>

      {videoDialog && (
        <ExportVideoDialog
          open
          onOpenChange={(open) => { if (!open) setVideoDialog(null); }}
          imageWidth={videoDialog.w}
          imageHeight={videoDialog.h}
          durationSec={scene.playback.duration}
          onExport={(opts) => {
            void runWebMExport(`WebM ${opts.height}p${opts.fps}`, opts);
          }}
        />
      )}

      <button className="toolbar-share" onClick={handleShare} disabled={sharing}>
        <Share size={14} style={{ marginRight: 6 }} />
        Share
      </button>
    </div>
  );
}
