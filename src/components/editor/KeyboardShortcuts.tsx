"use client";

import { useEffect } from "react";
import { useEditorStore } from "@/lib/store";

export function KeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const store = useEditorStore.getState();

      switch (e.code) {
        case "Space":
          e.preventDefault();
          store.setPlaying(!store.playing);
          break;
        case "KeyB":
          store.setActiveTool("brush-fg");
          break;
        case "KeyN":
          store.setActiveTool("brush-bg");
          break;
        case "KeyV":
          store.setActiveTool("pan");
          break;
        case "KeyS":
          store.setActiveTool("select");
          break;
        case "KeyM":
          store.toggleLayer("mask");
          break;
        case "BracketLeft":
          store.setBrushSize(Math.max(4, store.brushSize - 4));
          break;
        case "BracketRight":
          store.setBrushSize(Math.min(100, store.brushSize + 4));
          break;
        case "Home":
          store.setCurrentTime(0);
          break;
        case "End":
          store.setCurrentTime(store.scene.playback.duration);
          store.setPlaying(false);
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return null;
}
