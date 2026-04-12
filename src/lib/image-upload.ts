/**
 * Client-side image preparation and upload to R2.
 *
 * Flow:
 *  1. Compress the image (resize + re-encode as JPEG/PNG) to reduce size.
 *  2. Hash the compressed bytes (SHA-256) for dedup.
 *  3. Ask the server for a presigned upload URL (or skip if the hash already exists).
 *  4. PUT the bytes directly to R2.
 *  5. Return the final public URL + hash for storing in the scene record.
 */

const MAX_DIMENSION = 2048; // cap longest edge to keep files manageable
const JPEG_QUALITY = 0.88;

/** Convert a data URL or HTTP URL to a Blob. */
async function urlToBlob(url: string): Promise<Blob> {
  if (url.startsWith("data:")) {
    const res = await fetch(url);
    return res.blob();
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  return res.blob();
}

/** Compress an image blob by re-encoding at capped dimensions. */
async function compressImage(blob: Blob): Promise<Blob> {
  // Skip compression for GIFs (would lose animation) and small images
  if (blob.type === "image/gif" || blob.size < 100_000) return blob;

  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  const longest = Math.max(width, height);
  const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return blob;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  // Prefer JPEG for photos (much smaller), PNG only if original had transparency
  const outType = blob.type === "image/png" ? "image/jpeg" : "image/jpeg";
  const compressed: Blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b || blob), outType, JPEG_QUALITY);
  });

  // Only use compressed version if it actually saved bytes
  return compressed.size < blob.size ? compressed : blob;
}

/** SHA-256 hash the blob, return lowercase hex. */
async function hashBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface UploadResult {
  publicUrl: string;
  hash: string;
  bytes: number;
}

/** Prepare and upload an image to R2. Handles dedup via hash. */
export async function uploadImageToR2(imageUrl: string): Promise<UploadResult> {
  // 1. Fetch and compress
  const original = await urlToBlob(imageUrl);
  const compressed = await compressImage(original);

  // 2. Hash for dedup
  const hash = await hashBlob(compressed);

  // 3. Ask server for upload URL (or existing URL if hash already seen)
  const prepRes = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hash,
      contentType: compressed.type,
      size: compressed.size,
    }),
  });
  if (!prepRes.ok) {
    const err = await prepRes.json().catch(() => ({ error: "Upload prepare failed" }));
    throw new Error(err.error || "Upload prepare failed");
  }
  const { uploadUrl, publicUrl, existing } = await prepRes.json() as {
    uploadUrl?: string;
    publicUrl: string;
    existing: boolean;
  };

  // 4. If not existing, PUT directly to R2
  if (!existing && uploadUrl) {
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": compressed.type },
      body: compressed,
    });
    if (!putRes.ok) {
      const text = await putRes.text().catch(() => "");
      throw new Error(`R2 upload failed: ${putRes.status} ${text}`);
    }
  }

  return { publicUrl, hash, bytes: compressed.size };
}
