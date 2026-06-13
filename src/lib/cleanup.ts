/** A scene is expired when retention is enabled and it is older than the window. */
export function isExpired(createdAt: Date, retentionDays: number, now: Date): boolean {
  if (retentionDays <= 0) return false;
  const ageMs = now.getTime() - createdAt.getTime();
  return ageMs > retentionDays * 24 * 60 * 60 * 1000;
}

/** An R2 image is safe to delete only when nothing else references its hash. */
export function shouldDeleteImage(remainingRefs: number): boolean {
  return remainingRefs <= 0;
}
