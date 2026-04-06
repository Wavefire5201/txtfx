"use client";

import { useRef } from "react";
import { useEditorStore } from "@/lib/store";

export function Toolbar() {
  const fileRef = useRef<HTMLInputElement>(null);
  const setImageUrl = useEditorStore((s) => s.setImageUrl);
  const scene = useEditorStore((s) => s.scene);

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
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scene.txtfx";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="toolbar">
      <span className="toolbar-logo">txtfx</span>
      <span className="toolbar-sep">|</span>
      <button className="toolbar-item" onClick={() => fileRef.current?.click()}>
        Open Image
      </button>
      <button className="toolbar-item" onClick={handleExportJSON}>
        Export
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
      <div className="toolbar-spacer" />
      <button className="toolbar-share">Share</button>
    </div>
  );
}
