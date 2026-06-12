import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let _db: Db | null = null;

/**
 * Lazily connects on first use so importing this module (e.g. during
 * `next build` page-data collection) does not require DATABASE_URL.
 * Routes that actually query the database still fail fast with a clear
 * error when the env var is missing.
 */
export function getDb(): Db {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set — scene sharing and rate limiting require a database connection",
      );
    }
    _db = drizzle(neon(url), { schema });
  }
  return _db;
}
