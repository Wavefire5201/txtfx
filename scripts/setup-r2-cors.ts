/**
 * One-shot: apply a permissive GET CORS policy to the R2 bucket so the embedded
 * player can read pixels (getImageData) from cross-origin image URLs without
 * tainting the canvas. Run with: bun scripts/setup-r2-cors.ts
 */
import "dotenv/config";
import { PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { r2, BUCKET } from "../src/lib/r2";

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
