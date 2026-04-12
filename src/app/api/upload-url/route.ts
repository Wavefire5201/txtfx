import { NextResponse } from "next/server";
import { getUploadUrl, publicUrl, BUCKET } from "@/lib/r2";
import { db } from "@/db";
import { scenes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit, getClientIp, LIMITS } from "@/lib/rate-limit";

// Max 10MB per image (R2 free tier has plenty of room for typical uploads)
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * POST /api/upload-url
 * Body: { hash: string, contentType: string, size: number }
 * Returns: { uploadUrl?: string, publicUrl: string, existing: boolean }
 *
 * Dedup strategy: we check the DB for any scene already using this image hash.
 * If found, return the existing public URL (0 R2 operations). Otherwise return
 * a presigned PUT URL valid for 5 min. This avoids the Class B R2 HeadObject
 * cost that a "does this object exist" check would incur.
 */
export async function POST(request: Request) {
  try {
    if (!BUCKET) {
      return NextResponse.json({ error: "R2 not configured" }, { status: 503 });
    }

    // Rate limit uploads per IP
    const ip = getClientIp(request);
    const rl = await checkRateLimit("upload", ip, LIMITS.upload.limit, LIMITS.upload.windowSec);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many uploads. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    // Reject requests with oversized bodies before parsing
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > 4096) {
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    }

    const body = await request.json();
    const { hash, contentType, size } = body as {
      hash?: string;
      contentType?: string;
      size?: number;
    };

    // Validate input
    if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) {
      return NextResponse.json({ error: "Invalid hash" }, { status: 400 });
    }
    if (typeof contentType !== "string" || !ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 400 });
    }
    if (typeof size !== "number" || size <= 0 || size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Invalid or oversized image" }, { status: 413 });
    }

    // Determine extension from content type
    const ext = contentType === "image/jpeg" ? "jpg"
      : contentType === "image/png" ? "png"
      : contentType === "image/webp" ? "webp"
      : "gif";
    const key = `images/${hash}.${ext}`;
    const url = publicUrl(key);

    // Dedup via DB lookup (free, indexed) instead of R2 HeadObject (Class B op).
    // If any existing scene references this image hash, the R2 object must exist.
    const existingRows = await db
      .select({ imageUrl: scenes.imageUrl })
      .from(scenes)
      .where(eq(scenes.imageHash, hash))
      .limit(1);

    if (existingRows.length > 0 && existingRows[0].imageUrl) {
      return NextResponse.json({ publicUrl: existingRows[0].imageUrl, existing: true });
    }

    // No prior scene uses this image — generate a presigned upload URL
    const uploadUrl = await getUploadUrl(key, contentType);
    return NextResponse.json({ uploadUrl, publicUrl: url, existing: false });
  } catch (error) {
    console.error("Failed to generate upload URL:", error);
    return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
  }
}
