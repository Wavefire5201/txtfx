import { db } from "@/db";
import { scenes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { checkRateLimit, getClientIp, LIMITS } from "@/lib/rate-limit";

function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/** Deterministically stringify an object — sort keys recursively so equivalent
 * objects always produce the same string. Needed for stable content hashing. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
  return `{${parts.join(",")}}`;
}

function computeContentHash(sceneJson: string, imageHash: string | null): string {
  return createHash("sha256")
    .update(sceneJson)
    .update("\0")
    .update(imageHash || "")
    .digest("hex");
}

/**
 * POST /api/scenes
 * Body: { scene: SceneData, imageUrl?: string, imageHash?: string }
 *
 * The scene JSON should NOT contain the embedded image data URL anymore.
 * The image lives in R2 and its public URL is passed separately.
 */
export async function POST(request: Request) {
  try {
    // Rate limit scene creation per IP
    const ip = getClientIp(request);
    const rl = await checkRateLimit("scene", ip, LIMITS.scene.limit, LIMITS.scene.windowSec);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many shares. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    // Reject oversized request bodies before parsing
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    }

    const body = await request.json();
    if (!body.scene || !body.scene.version) {
      return NextResponse.json({ error: "Invalid scene data" }, { status: 400 });
    }

    // Strip any legacy embedded image data to keep the JSON small
    const sceneForStorage = { ...body.scene };
    if (sceneForStorage.image) {
      sceneForStorage.image = {
        ...sceneForStorage.image,
        data: "",
      };
    }

    // Use stable stringify for deterministic hashing (same scene → same hash)
    const normalizedJson = stableStringify(sceneForStorage);
    // Store compact JSON (not stable) — storage format doesn't need sorted keys
    const data = JSON.stringify(sceneForStorage);

    if (data.length > 1024 * 1024) {
      return NextResponse.json({ error: "Scene metadata too large (max 1MB)" }, { status: 413 });
    }

    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : null;
    const imageHash = typeof body.imageHash === "string" ? body.imageHash : null;

    // Dedup: compute hash of normalized scene + image hash, check for existing record
    const contentHash = computeContentHash(normalizedJson, imageHash);
    const existing = await db
      .select({ id: scenes.id })
      .from(scenes)
      .where(eq(scenes.contentHash, contentHash))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ id: existing[0].id, url: `/s/${existing[0].id}`, deduped: true });
    }

    const id = generateId();
    await db.insert(scenes).values({ id, data, imageUrl, imageHash, contentHash });

    return NextResponse.json({ id, url: `/s/${id}` });
  } catch (error) {
    console.error("Failed to save scene:", error);
    return NextResponse.json({ error: "Failed to save scene" }, { status: 500 });
  }
}
