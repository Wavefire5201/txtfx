export type GifPresetId = "preview" | "balanced" | "quality";
export type VideoPresetId = "balanced" | "high" | "transparent";
export type ApngPresetId = "balanced" | "transparent";
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
  /** Encode an alpha channel (VP8/VP9 side data, WebM container only). */
  transparent?: boolean;
}

export interface ApngExportPreset {
  id: ApngPresetId;
  label: string;
  targetHeight: number;
  fps: number;
  maxDuration: number;
  /** Render over a transparent backdrop. */
  transparent?: boolean;
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
  transparent: {
    id: "transparent",
    label: "WebM Transparent",
    targetHeight: 1080,
    fps: 30,
    videoBitsPerSecond: 8_000_000,
    transparent: true,
  },
};

export const APNG_EXPORT_PRESETS: Record<ApngPresetId, ApngExportPreset> = {
  balanced: {
    id: "balanced",
    label: "APNG (full color)",
    targetHeight: 480,
    fps: 12,
    maxDuration: 5,
    transparent: false,
  },
  transparent: {
    id: "transparent",
    label: "APNG Transparent",
    targetHeight: 480,
    fps: 12,
    maxDuration: 5,
    transparent: true,
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

export function resolveApngPreset(id: ApngPresetId): ApngExportPreset {
  return APNG_EXPORT_PRESETS[id];
}

export function resolveStillPreset(id: StillPresetId): StillExportPreset {
  return STILL_EXPORT_PRESETS[id];
}

// ---------------------------------------------------------------------------
// Custom video resolution support
// ---------------------------------------------------------------------------

export const VIDEO_MIN_HEIGHT = 240;
export const VIDEO_MAX_HEIGHT = 2160;
export const VIDEO_MAX_WIDTH = 4096;
export const VIDEO_HEIGHT_CHOICES = [720, 1080, 1440, 2160] as const;
export const VIDEO_FPS_CHOICES = [24, 30, 60] as const;

/**
 * Output size for a target height, preserving the image aspect, clamped to
 * encoder-safe bounds and rounded to EVEN dimensions (VP9/H.264 requirement).
 */
export function computeVideoDimensions(
  imageWidth: number,
  imageHeight: number,
  targetHeight: number,
): { width: number; height: number } {
  const aspect = imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 16 / 9;
  let height = Math.round(Math.min(VIDEO_MAX_HEIGHT, Math.max(VIDEO_MIN_HEIGHT, targetHeight)));
  let width = Math.round(height * aspect);
  if (width > VIDEO_MAX_WIDTH) {
    width = VIDEO_MAX_WIDTH;
    height = Math.round(width / aspect);
  }
  width &= ~1;
  height &= ~1;
  return { width, height };
}

/**
 * Bitrate scaled to pixel throughput (~0.12 bits/pixel/frame — matches the
 * fidelity of the existing presets: 720p24 ≈ 2.7Mbps, 1080p30 ≈ 7.5Mbps).
 */
export function videoBitrateFor(width: number, height: number, fps: number): number {
  const bits = width * height * fps * 0.12;
  return Math.round(Math.min(20_000_000, Math.max(1_000_000, bits)));
}
