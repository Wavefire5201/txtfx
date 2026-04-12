import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Load .env.local (where DATABASE_URL lives) for drizzle-kit CLI
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
