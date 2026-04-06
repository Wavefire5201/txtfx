import type { EffectType, MaskRegion } from "./effects/types";

export interface SceneData {
  version: number;
  image: {
    data: string;
    width: number;
    height: number;
  };
  ascii: {
    ramp: string;
    fontSize: string;
    fontFamily: string;
    lineHeight: number;
    letterSpacing: string;
    blendMode: string;
    opacity: number;
    color: string;
  };
  mask: {
    data: string;
    feather: number;
  };
  effects: EffectConfig[];
  style: {
    tint: string;
    vignette: number;
    fallbackBg: string;
  };
  playback: {
    duration: number;
    fps: number;
    loop: boolean;
  };
}

export interface EffectConfig {
  id: string;
  type: EffectType;
  enabled: boolean;
  maskRegion: MaskRegion;
  params: Record<string, unknown>;
  timeline: {
    start: number;
    end: number | null;
    loop: boolean;
  };
}

export function createDefaultScene(): SceneData {
  return {
    version: 1,
    image: { data: "", width: 0, height: 0 },
    ascii: {
      ramp: " .`,:;cbaO0%#@",
      fontSize: "0.85vw",
      fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', monospace",
      lineHeight: 0.78,
      letterSpacing: "0.06em",
      blendMode: "screen",
      opacity: 0.38,
      color: "rgba(220, 230, 255, 0.38)",
    },
    mask: { data: "", feather: 4 },
    effects: [],
    style: {
      tint: "rgba(180, 70, 90, 0.1)",
      vignette: 0.45,
      fallbackBg: "auto",
    },
    playback: {
      duration: 10,
      fps: 30,
      loop: true,
    },
  };
}

export function serializeScene(scene: SceneData): string {
  return JSON.stringify(scene);
}

export function deserializeScene(json: string): SceneData {
  const data = JSON.parse(json) as SceneData;
  if (!data.version) throw new Error("Invalid scene format");
  return data;
}
