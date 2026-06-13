/** Idempotent: add the og_image_url column. Run: bun scripts/db-add-og-column.ts */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set. Aborting.");
  process.exit(1);
}
const sql = neon(url);
await sql`ALTER TABLE scenes ADD COLUMN IF NOT EXISTS og_image_url text;`;
console.log("Column og_image_url ensured on scenes.");
