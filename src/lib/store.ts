"use client";

import { create } from "zustand";
import { type SceneData, type EffectConfig, createDefaultScene } from "@/engine/scene";
import type { EffectType, MaskRegion } from "@/engine/effects/types";
import { Mask } from "@/engine/mask";

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
  reorderEffect: (fromIndex: number, toIndex: number) => void;

  // Mask
  mask: Mask | null;
  initMask: (width: number, height: number) => void;
  maskVersion: number;
  bumpMaskVersion: () => void;
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
  showImage: boolean;
  toggleLayer: (layer: "mask" | "ascii" | "effects" | "image") => void;

  // UI
  expandedEffects: Set<string>;
  toggleExpandEffect: (id: string) => void;
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
        applyToAscii: false,
      };
      const expanded = new Set(s.expandedEffects);
      expanded.add(id);
      return {
        scene: { ...s.scene, effects: [...s.scene.effects, effect] },
        expandedEffects: expanded,
      };
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
  reorderEffect: (fromIndex, toIndex) =>
    set((s) => {
      const effects = [...s.scene.effects];
      const [moved] = effects.splice(fromIndex, 1);
      effects.splice(toIndex, 0, moved);
      return { scene: { ...s.scene, effects } };
    }),

  mask: null,
  initMask: (width, height) => set({ mask: new Mask(width, height) }),
  maskVersion: 0,
  bumpMaskVersion: () => set((s) => ({ maskVersion: s.maskVersion + 1 })),
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
  showImage: true,
  toggleLayer: (layer) =>
    set((s) => {
      if (layer === "mask") return { showMask: !s.showMask };
      if (layer === "ascii") return { showAscii: !s.showAscii };
      if (layer === "effects") return { showEffects: !s.showEffects };
      return { showImage: !s.showImage };
    }),

  expandedEffects: new Set<string>(),
  toggleExpandEffect: (id) =>
    set((s) => {
      const expanded = new Set(s.expandedEffects);
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      return { expandedEffects: expanded };
    }),
}));
