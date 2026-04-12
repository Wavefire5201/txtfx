import { pgTable, text, timestamp, varchar, integer, index, primaryKey } from "drizzle-orm/pg-core";

export const scenes = pgTable("scenes", {
  id: varchar("id", { length: 12 }).primaryKey(),
  // Scene JSON without the image data URL (image is stored in R2 separately)
  data: text("data").notNull(),
  // Public URL of the image stored in R2 (nullable for legacy scenes)
  imageUrl: text("image_url"),
  // SHA-256 hash of the image bytes (for image deduplication)
  imageHash: varchar("image_hash", { length: 64 }),
  // SHA-256 hash of (normalized scene JSON + image hash) — for share link dedup
  contentHash: varchar("content_hash", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  imageHashIdx: index("scenes_image_hash_idx").on(table.imageHash),
  contentHashIdx: index("scenes_content_hash_idx").on(table.contentHash),
}));

/**
 * Rate limit counters. Fixed-window: one row per (bucket, key) where bucket is
 * an action name (e.g. "upload") and key is the client identifier (IP).
 * window_start tracks when the current window began; count increments until
 * the window expires, then resets on the next request.
 */
export const rateLimits = pgTable("rate_limits", {
  bucket: varchar("bucket", { length: 32 }).notNull(),
  key: varchar("key", { length: 64 }).notNull(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start").notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.bucket, table.key] }),
}));
