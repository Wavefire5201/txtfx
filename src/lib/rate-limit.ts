import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { sql } from "drizzle-orm";

/**
 * Fixed-window rate limiter backed by Postgres.
 *
 * Atomically increments a counter for (bucket, key). If the existing window
 * has expired, it resets to a fresh window with count=1. Returns whether the
 * request should be allowed and the current count.
 *
 * This uses a single upsert so it's safe under concurrency — no read-then-write
 * race. No background cleanup needed; expired rows get overwritten on the next
 * request from the same (bucket, key).
 *
 * @param bucket  Action bucket name (e.g. "upload", "scene", "share")
 * @param key     Client identifier (usually IP address)
 * @param limit   Max requests allowed in the window
 * @param windowSeconds  Window length in seconds
 */
export async function checkRateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; count: number; retryAfterSec: number }> {
  const result = await db.execute(sql`
    INSERT INTO rate_limits (bucket, key, count, window_start)
    VALUES (${bucket}, ${key}, 1, NOW())
    ON CONFLICT (bucket, key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start > NOW() - (${windowSeconds} || ' seconds')::interval
        THEN rate_limits.count + 1
        ELSE 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start > NOW() - (${windowSeconds} || ' seconds')::interval
        THEN rate_limits.window_start
        ELSE NOW()
      END
    RETURNING count, EXTRACT(EPOCH FROM (window_start + (${windowSeconds} || ' seconds')::interval - NOW()))::integer AS retry_after;
  `);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = (result.rows || result)[0] as any;
  const count = Number(row?.count ?? 0);
  const retryAfterSec = Math.max(0, Number(row?.retry_after ?? windowSeconds));

  return {
    allowed: count <= limit,
    count,
    retryAfterSec,
  };
}

/** Extract the client IP from a Next.js request, honoring common proxy headers. */
export function getClientIp(request: Request): string {
  // Cloudflare
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf;
  // Standard proxy chain (take first = original client)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  // Fallback
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

/** Rate limit presets */
export const LIMITS = {
  upload: { limit: 30, windowSec: 60 * 60 },      // 30 uploads/hour per IP
  scene: { limit: 60, windowSec: 60 * 60 },        // 60 scene creates/hour per IP
  read: { limit: 300, windowSec: 60 * 60 },        // 300 scene reads/hour per IP
} as const;
