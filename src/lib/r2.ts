import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
  console.warn("[r2] Missing env vars — sharing with R2 will not work");
}

export const BUCKET = bucketName || "";
export const PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "";

// 1 year immutable — safe because keys are content-addressed (hash.ext).
// Same key always means same content, so we can cache forever.
const CACHE_CONTROL = "public, max-age=31536000, immutable";

export const r2 = new S3Client({
  region: "auto",
  endpoint: accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "",
  credentials: {
    accessKeyId: accessKeyId || "",
    secretAccessKey: secretAccessKey || "",
  },
  // R2 doesn't support the new CRC32 checksum headers that @aws-sdk/client-s3
  // adds by default. Disable them so presigned URLs don't include invalid params.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

/** Returns a presigned PUT URL valid for 5 minutes. Bakes in Cache-Control so
 * the uploaded object is immutable-cacheable by browsers and Cloudflare CDN. */
export async function getUploadUrl(key: string, contentType: string): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    CacheControl: CACHE_CONTROL,
  });
  return getSignedUrl(r2, cmd, { expiresIn: 300 });
}

/** Build the public URL for an image key */
export function publicUrl(key: string): string {
  if (!PUBLIC_URL) return "";
  return `${PUBLIC_URL.replace(/\/$/, "")}/${key}`;
}

/** Extract key from a full public URL (for cleanup) */
export function keyFromUrl(url: string): string | null {
  if (!PUBLIC_URL || !url.startsWith(PUBLIC_URL)) return null;
  return url.slice(PUBLIC_URL.replace(/\/$/, "").length + 1);
}
