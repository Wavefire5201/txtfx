/**
 * One-shot: apply a permissive GET CORS policy to the R2 bucket so the embedded
 * player can read pixels (getImageData) from cross-origin image URLs without
 * tainting the canvas. Run with: bun scripts/setup-r2-cors.ts
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

// Dynamic imports AFTER dotenv loads — src/lib/r2.ts reads R2_* env at import
// time, so a static import (hoisted above config()) would capture empty vars.
const { PutBucketCorsCommand } = await import("@aws-sdk/client-s3");
const { r2, BUCKET } = await import("../src/lib/r2");

if (!BUCKET) {
  console.error("R2 not configured (missing env vars). Aborting.");
  process.exit(1);
}

await r2.send(
  new PutBucketCorsCommand({
    Bucket: BUCKET,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedMethods: ["GET", "HEAD"],
          AllowedOrigins: ["*"],
          AllowedHeaders: ["*"],
          ExposeHeaders: ["Content-Length", "Content-Type"],
          MaxAgeSeconds: 86400,
        },
      ],
    },
  }),
);

console.log(`R2 CORS policy applied to bucket "${BUCKET}".`);
