export type ExportFormat = "png" | "jpeg" | "gif" | "webm" | "mp4" | "frames" | "text" | "ansi";

export interface ExportCostInput {
  width: number;
  height: number;
  fps: number;
  duration: number;
}

export interface ExportCostEstimate {
  frameCount: number;
  pixelCount: number;
  totalPixels: number;
}

export interface ExportMetrics {
  format: ExportFormat;
  width: number;
  height: number;
  fps: number;
  duration: number;
  frameCount: number;
  pixelCount: number;
  totalPixels: number;
  startedAt: number;
  endedAt?: number;
  elapsedMs?: number;
  /** Average wall-clock cost per frame (render + encode) — the export perf headline. */
  msPerFrame?: number;
  bytes?: number;
}

export function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function estimateExportCost(input: ExportCostInput): ExportCostEstimate {
  const frameCount = Math.max(1, Math.round(input.duration * input.fps));
  const pixelCount = Math.max(0, Math.round(input.width * input.height));
  return {
    frameCount,
    pixelCount,
    totalPixels: frameCount * pixelCount,
  };
}

export function createExportMetrics(input: ExportCostInput & {
  format: ExportFormat;
  startedAt?: number;
}): ExportMetrics {
  const estimate = estimateExportCost(input);
  return {
    ...input,
    ...estimate,
    startedAt: input.startedAt ?? nowMs(),
  };
}

export function finishExportMetrics(
  metrics: ExportMetrics,
  result: { endedAt?: number; bytes?: number },
): ExportMetrics {
  const endedAt = result.endedAt ?? nowMs();
  const elapsedMs = endedAt - metrics.startedAt;
  return {
    ...metrics,
    endedAt,
    elapsedMs,
    msPerFrame: metrics.frameCount > 0 ? elapsedMs / metrics.frameCount : undefined,
    bytes: result.bytes,
  };
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "unknown";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Number(kb.toFixed(kb >= 10 ? 0 : 1))} KB`;
  const mb = kb / 1024;
  return `${Number(mb.toFixed(mb >= 10 ? 1 : 2))} MB`;
}
