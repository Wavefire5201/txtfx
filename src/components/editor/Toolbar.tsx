"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useEditorStore } from "@/lib/store";
import { exportStandaloneHTML } from "@/engine/export/html";
import { exportEmbedSnippet } from "@/engine/export/embed";
import { type SceneData, createDefaultScene } from "@/engine/scene";
import { Mask } from "@/engine/mask";
import { clearState } from "@/lib/cache";
import { uploadImageToR2 } from "@/lib/image-upload";
import { toast } from "./Toast";
import { ConfirmDialog } from "./ConfirmDialog";
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
} from "@phosphor-icons/react";

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
  const [exporting, setExporting] = useState(false);
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
          onClick={() => setExportOpen(!exportOpen)}
          disabled={exporting}
        >
          <Export size={14} style={{ marginRight: 4 }} />
          {exporting ? "Exporting..." : "Export"}
          <CaretDown size={10} style={{ marginLeft: 4, opacity: 0.5 }} />
        </button>

        {exportOpen && (
          <>
            <div className="toolbar-dropdown-backdrop" onClick={() => setExportOpen(false)} />
            <div className="toolbar-dropdown">
              <button className="toolbar-dropdown-item" onClick={handleExportJSON}>
                <FileArrowDown size={14} />
                <span>Scene JSON (.txtfx)</span>
              </button>
              <button className="toolbar-dropdown-item" onClick={handleExportHTML} disabled title="Coming soon — export engine being rebuilt">
                <FileHtml size={14} />
                <span>Standalone HTML</span>
              </button>
              <button className="toolbar-dropdown-item" onClick={handleExportEmbed}>
                <Code size={14} />
                <span>Copy embed snippet</span>
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

      <button className="toolbar-share" onClick={handleShare} disabled={sharing}>
        <Share size={14} style={{ marginRight: 6 }} />
        Share
      </button>
    </div>
  );
}
