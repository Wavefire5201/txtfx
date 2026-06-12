export type GifPresetId = "preview" | "balanced" | "quality";
export type VideoPresetId = "balanced" | "high";
export type StillPresetId = "standard" | "high" | "transparent";

export interface GifExportPreset {
  id: GifPresetId;
  label: string;
  targetHeight: number;
  fps: number;
  maxColors: number;
  maxDuration: number;
  paletteMode: "global" | "local";
  colorFormat: "rgb444" | "rgb565";
  /** false = keep full channel precision before quantization (sharpest text). */
  prequantize?: boolean;
}

export interface VideoExportPreset {
  id: VideoPresetId;
  label: string;
  targetHeight: number;
  fps: number;
  videoBitsPerSecond: number;
}

export interface StillExportPreset {
  id: StillPresetId;
  label: string;
  targetHeight: number;
  type: "image/png" | "image/jpeg";
  quality?: number;
  transparent?: boolean;
}

export const GIF_EXPORT_PRESETS: Record<GifPresetId, GifExportPreset> = {
  preview: {
    id: "preview",
    label: "GIF Preview",
    targetHeight: 320,
    fps: 8,
    maxColors: 32,
    maxDuration: 3,
    paletteMode: "global",
    colorFormat: "rgb444",
  },
  balanced: {
    id: "balanced",
    label: "GIF Balanced",
    targetHeight: 480,
    fps: 10,
    maxColors: 64,
    maxDuration: 5,
    paletteMode: "global",
    colorFormat: "rgb444",
  },
  quality: {
    id: "quality",
    label: "GIF Quality",
    targetHeight: 720,
    fps: 12,
    // Full GIF palette + no precision pre-rounding: glyph antialiasing gets
    // enough levels to stay crisp instead of collapsing to fuzz. Encoding
    // runs in a worker, so the extra quantization cost is invisible.
    maxColors: 256,
    maxDuration: 8,
    paletteMode: "local",
    colorFormat: "rgb565",
    prequantize: false,
  },
};

export const VIDEO_EXPORT_PRESETS: Record<VideoPresetId, VideoExportPreset> = {
  balanced: {
    id: "balanced",
    label: "WebM Balanced",
    targetHeight: 720,
    fps: 24,
    videoBitsPerSecond: 3_000_000,
  },
  high: {
    id: "high",
    label: "WebM High Quality",
    targetHeight: 1080,
    fps: 30,
    videoBitsPerSecond: 8_000_000,
  },
};

export const STILL_EXPORT_PRESETS: Record<StillPresetId, StillExportPreset> = {
  standard: {
    id: "standard",
    label: "PNG Still",
    targetHeight: 1080,
    type: "image/png",
  },
  high: {
    id: "high",
    label: "PNG Still High Res",
    targetHeight: 1600,
    type: "image/png",
  },
  transparent: {
    id: "transparent",
    label: "Transparent Overlay",
    targetHeight: 1080,
    type: "image/png",
    transparent: true,
  },
};

export function resolveGifPreset(id: GifPresetId): GifExportPreset {
  return GIF_EXPORT_PRESETS[id];
}

export function resolveVideoPreset(id: VideoPresetId): VideoExportPreset {
  return VIDEO_EXPORT_PRESETS[id];
}

export function resolveStillPreset(id: StillPresetId): StillExportPreset {
  return STILL_EXPORT_PRESETS[id];
}
