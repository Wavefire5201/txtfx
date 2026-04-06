"use client";

import { useRef, useState } from "react";
import { useEditorStore } from "@/lib/store";
import { exportStandaloneHTML } from "@/engine/export/html";
import { exportEmbedSnippet } from "@/engine/export/embed";
import { toast } from "./Toast";
import {
  FolderOpen,
  Export,
  FileHtml,
  Code,
  FileArrowDown,
  Share,
  CaretDown,
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
  const setImageUrl = useEditorStore((s) => s.setImageUrl);
  const scene = useEditorStore((s) => s.scene);
  const [exportOpen, setExportOpen] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageUrl(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleExportJSON() {
    const blob = new Blob([JSON.stringify(scene, null, 2)], { type: "application/json" });
    downloadBlob(blob, "scene.txtfx");
    setExportOpen(false);
    toast("Scene exported as JSON");
  }

  function handleExportHTML() {
    const html = exportStandaloneHTML(scene);
    const blob = new Blob([html], { type: "text/html" });
    downloadBlob(blob, "scene.html");
    setExportOpen(false);
    toast("Exported as standalone HTML");
  }

  function handleExportEmbed() {
    const snippet = exportEmbedSnippet(scene);
    navigator.clipboard.writeText(snippet).then(() => {
      toast("Embed snippet copied to clipboard");
    }).catch(() => {
      toast("Could not copy to clipboard", "warning");
    });
    setExportOpen(false);
  }

  function handleShare() {
    const json = JSON.stringify(scene);
    const blob = new Blob([json], { type: "application/json" });
    downloadBlob(blob, "scene.txtfx");
    toast("Scene file downloaded for sharing");
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

      <div className="toolbar-dropdown-wrap">
        <button
          className="toolbar-item"
          onClick={() => setExportOpen(!exportOpen)}
        >
          <Export size={14} style={{ marginRight: 4 }} />
          Export
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
              <button className="toolbar-dropdown-item" onClick={handleExportHTML}>
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

      <button className="toolbar-share" onClick={handleShare}>
        <Share size={14} style={{ marginRight: 6 }} />
        Share
      </button>
    </div>
  );
}
