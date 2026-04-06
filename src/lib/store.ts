"use client";

import { create } from "zustand";
import { type SceneData, type EffectConfig, createDefaultScene } from "@/engine/scene";
import type { EffectType, MaskRegion } from "@/engine/effects/types";

type Tool = "brush-fg" | "brush-bg" | "pan" | "select";

interface EditorState {
  // Scene
  scene: SceneData;
  setScene: (scene: SceneData) => void;
  updateAscii: (updates: Partial<SceneData["ascii"]>) => void;
  updateStyle: (updates: Partial<SceneData["style"]>) => void;
  updatePlayback: (updates: Partial<SceneData["playback"]>) => void;

  // Image
  imageUrl: string | null;
  setImageUrl: (url: string) => void;

  // Effects
  addEffect: (type: EffectType) => void;
  removeEffect: (id: string) => void;
  toggleEffect: (id: string) => void;
  updateEffect: (id: string, updates: Partial<EffectConfig>) => void;
  updateEffectParams: (id: string, params: Record<string, unknown>) => void;

  // Mask
  maskFeather: number;
  setMaskFeather: (feather: number) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;

  // Tools
  activeTool: Tool;
  setActiveTool: (tool: Tool) => void;

  // Playback
  playing: boolean;
  currentTime: number;
  setPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;

  // Layers
  showMask: boolean;
  showAscii: boolean;
  showEffects: boolean;
  toggleLayer: (layer: "mask" | "ascii" | "effects") => void;
}

let effectCounter = 0;

export const useEditorStore = create<EditorState>((set) => ({
  scene: createDefaultScene(),
  setScene: (scene) => set({ scene }),
  updateAscii: (updates) =>
    set((s) => ({ scene: { ...s.scene, ascii: { ...s.scene.ascii, ...updates } } })),
  updateStyle: (updates) =>
    set((s) => ({ scene: { ...s.scene, style: { ...s.scene.style, ...updates } } })),
  updatePlayback: (updates) =>
    set((s) => ({ scene: { ...s.scene, playback: { ...s.scene.playback, ...updates } } })),

  imageUrl: null,
  setImageUrl: (url) => set({ imageUrl: url }),

  addEffect: (type) =>
    set((s) => {
      const id = `${type}-${++effectCounter}`;
      const effect: EffectConfig = {
        id,
        type,
        enabled: true,
        maskRegion: "background" as MaskRegion,
        params: {},
        timeline: { start: 0, end: null, loop: true },
      };
      return { scene: { ...s.scene, effects: [...s.scene.effects, effect] } };
    }),
  removeEffect: (id) =>
    set((s) => ({
      scene: { ...s.scene, effects: s.scene.effects.filter((e) => e.id !== id) },
    })),
  toggleEffect: (id) =>
    set((s) => ({
      scene: {
        ...s.scene,
        effects: s.scene.effects.map((e) =>
          e.id === id ? { ...e, enabled: !e.enabled } : e
        ),
      },
    })),
  updateEffect: (id, updates) =>
    set((s) => ({
      scene: {
        ...s.scene,
        effects: s.scene.effects.map((e) =>
          e.id === id ? { ...e, ...updates } : e
        ),
      },
    })),
  updateEffectParams: (id, params) =>
    set((s) => ({
      scene: {
        ...s.scene,
        effects: s.scene.effects.map((e) =>
          e.id === id ? { ...e, params: { ...e.params, ...params } } : e
        ),
      },
    })),

  maskFeather: 4,
  setMaskFeather: (feather) => set({ maskFeather: feather }),
  brushSize: 24,
  setBrushSize: (size) => set({ brushSize: size }),

  activeTool: "pan",
  setActiveTool: (tool) => set({ activeTool: tool }),

  playing: false,
  currentTime: 0,
  setPlaying: (playing) => set({ playing }),
  setCurrentTime: (time) => set({ currentTime: time }),

  showMask: false,
  showAscii: true,
  showEffects: true,
  toggleLayer: (layer) =>
    set((s) => {
      if (layer === "mask") return { showMask: !s.showMask };
      if (layer === "ascii") return { showAscii: !s.showAscii };
      return { showEffects: !s.showEffects };
    }),
}));
