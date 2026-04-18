"use client";

import { create } from "zustand";
import { type SceneData, type EffectConfig, createDefaultScene } from "@/engine/scene";
import type { EffectType, MaskRegion } from "@/engine/effects/types";
import { Mask } from "@/engine/mask";
import { saveState } from "@/lib/cache";

type Tool = "select" | "brush-fg" | "brush-bg" | "pan";

interface EditorState {
  // Scene
  scene: SceneData;
  setScene: (scene: SceneData) => void;
  updateAscii: (updates: Partial<SceneData["ascii"]>) => void;
  updatePlayback: (updates: Partial<SceneData["playback"]>) => void;

  // Image
  imageUrl: string | null;
  setImageUrl: (url: string) => void;

  // Effects
  addEffect: (type: EffectType) => void;
  removeEffect: (id: string) => void;
  clearEffects: () => void;
  toggleEffect: (id: string) => void;
  updateEffect: (id: string, updates: Partial<EffectConfig>) => void;
  updateEffectParams: (id: string, params: Record<string, unknown>) => void;
  reorderEffect: (fromIndex: number, toIndex: number) => void;

  // Mask
  mask: Mask | null;
  initMask: (width: number, height: number) => void;
  setMask: (mask: Mask) => void;
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

  // Zoom
  zoom: number;
  setZoom: (zoom: number) => void;

  // Pan
  panX: number;
  panY: number;
  setPan: (x: number, y: number) => void;

  // UI
  expandedEffects: Set<string>;
  toggleExpandEffect: (id: string) => void;

  // Panel collapse
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;

  // Timeline collapse
  timelineCollapsed: boolean;
  toggleTimeline: () => void;

  // Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

let effectCounter = 0;

const MAX_HISTORY = 50;

interface HistoryEntry {
  scene: SceneData;
  mask?: { data: Uint8Array; width: number; height: number };
}

let _history: HistoryEntry[] = [];
let _historyIndex = -1;
let _skipHistory = false;

function pushHistory(scene: SceneData, mask?: Mask | null) {
  if (_skipHistory) return;
  // Truncate any redo states
  _history = _history.slice(0, _historyIndex + 1);
  _history.push({
    scene: JSON.parse(JSON.stringify(scene)),
    mask: mask ? { data: new Uint8Array(mask.data), width: mask.width, height: mask.height } : undefined,
  });
  if (_history.length > MAX_HISTORY) _history.shift();
  _historyIndex = _history.length - 1;
}

/** Snapshot the current mask to the history stack (called after paint stroke ends) */
export function pushMaskHistory() {
  const state = useEditorStore.getState();
  pushHistory(state.scene, state.mask);
  useEditorStore.setState({
    canUndo: _historyIndex > 0,
    canRedo: false,
  });
}

/**
 * Lightweight animation time that updates every frame (60fps).
 * Canvas writes this directly; Timeline reads it via rAF.
 * Bypasses React rendering for smooth playhead updates.
 */
export const animationTime = { current: 0 };

export const useEditorStore = create<EditorState>((set) => ({
  scene: createDefaultScene(),
  setScene: (scene) => {
    // Migrate legacy loop -> mode on effects
    const migrated = {
      ...scene,
      effects: scene.effects.map((fx) => {
        const tl = fx.timeline as any;
        if (tl.mode === undefined && tl.loop !== undefined) {
          return { ...fx, timeline: { start: tl.start, end: tl.end, mode: tl.loop ? "continuous" as const : "one-shot" as const } };
        }
        return fx;
      }),
    };
    set({ scene: migrated });
  },
  updateAscii: (updates) =>
    set((s) => ({ scene: { ...s.scene, ascii: { ...s.scene.ascii, ...updates } } })),
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
        timeline: { start: 0, end: null, mode: "continuous" as const },
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
  clearEffects: () =>
    set((s) => ({
      scene: { ...s.scene, effects: [] },
      expandedEffects: new Set<string>(),
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
  setMask: (mask) => set({ mask, maskVersion: 0 }),
  maskVersion: 0,
  bumpMaskVersion: () => set((s) => ({ maskVersion: s.maskVersion + 1 })),
  maskFeather: 4,
  setMaskFeather: (feather) => set({ maskFeather: feather }),
  brushSize: 24,
  setBrushSize: (size) => set({ brushSize: size }),

  activeTool: "select",
  setActiveTool: (tool) => set({ activeTool: tool }),

  playing: false,
  currentTime: 0,
  setPlaying: (playing) => set({ playing }),
  setCurrentTime: (time) => set({ currentTime: time }),

  showMask: true,
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

  zoom: 1,
  setZoom: (zoom) => set({ zoom: Math.max(0.25, Math.min(4, zoom)) }),

  panX: 0,
  panY: 0,
  setPan: (x, y) => set({ panX: x, panY: y }),

  expandedEffects: new Set<string>(),
  toggleExpandEffect: (id) =>
    set((s) => {
      const expanded = new Set(s.expandedEffects);
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      return { expandedEffects: expanded };
    }),

  leftPanelCollapsed: false,
  rightPanelCollapsed: false,
  toggleLeftPanel: () => set((s) => ({ leftPanelCollapsed: !s.leftPanelCollapsed })),
  toggleRightPanel: () => set((s) => ({ rightPanelCollapsed: !s.rightPanelCollapsed })),

  timelineCollapsed: false,
  toggleTimeline: () => set((s) => ({ timelineCollapsed: !s.timelineCollapsed })),

  canUndo: false,
  canRedo: false,
  undo: () => {
    if (_historyIndex <= 0) return;
    _historyIndex--;
    _skipHistory = true;
    const entry = _history[_historyIndex];
    const restoredScene = JSON.parse(JSON.stringify(entry.scene));
    set((s) => ({
      scene: restoredScene,
      mask: entry.mask ? new Mask(entry.mask.width, entry.mask.height, new Uint8Array(entry.mask.data)) : s.mask,
      maskVersion: s.maskVersion + 1,
      canUndo: _historyIndex > 0,
      canRedo: true,
    }));
    _lastSceneJson = JSON.stringify(restoredScene);
    _skipHistory = false;
  },
  redo: () => {
    if (_historyIndex >= _history.length - 1) return;
    _historyIndex++;
    _skipHistory = true;
    const entry = _history[_historyIndex];
    const restoredScene = JSON.parse(JSON.stringify(entry.scene));
    set((s) => ({
      scene: restoredScene,
      mask: entry.mask ? new Mask(entry.mask.width, entry.mask.height, new Uint8Array(entry.mask.data)) : s.mask,
      maskVersion: s.maskVersion + 1,
      canUndo: true,
      canRedo: _historyIndex < _history.length - 1,
    }));
    _lastSceneJson = JSON.stringify(restoredScene);
    _skipHistory = false;
  },
}));

// Track scene changes for undo/redo
let _lastSceneJson = "";
useEditorStore.subscribe((state) => {
  if (_skipHistory) return;
  const json = JSON.stringify(state.scene);
  if (json === _lastSceneJson) return;
  _lastSceneJson = json;
  pushHistory(state.scene, state.mask);
  // Update canUndo/canRedo flags
  useEditorStore.setState({
    canUndo: _historyIndex > 0,
    canRedo: false, // New action clears redo
  });
});

// Auto-save to IndexedDB (debounced) — handles large images that exceed localStorage limits
let saveTimeout: ReturnType<typeof setTimeout>;
useEditorStore.subscribe((state, prevState) => {
  // Only save when scene, imageUrl, or mask changes
  if (state.scene === prevState.scene && state.imageUrl === prevState.imageUrl && state.maskVersion === prevState.maskVersion) return;
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const m = state.mask;
    saveState({
      scene: state.scene,
      imageUrl: state.imageUrl,
      maskData: m ? m.toBase64() : "",
      maskWidth: m ? m.width : 0,
      maskHeight: m ? m.height : 0,
    });
  }, 1000);
});
