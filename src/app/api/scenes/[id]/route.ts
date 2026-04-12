import { db } from "@/db";
import { scenes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp, LIMITS } from "@/lib/rate-limit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Rate limit scene reads per IP — protects against enumeration/scraping
    const ip = getClientIp(request);
    const rl = await checkRateLimit("read", ip, LIMITS.read.limit, LIMITS.read.windowSec);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const { id } = await params;
    // Validate ID format (alphanumeric, 8 chars) to prevent injection
    if (!/^[a-z0-9]{8}$/.test(id)) {
      return NextResponse.json({ error: "Invalid scene id" }, { status: 400 });
    }
    const result = await db.select().from(scenes).where(eq(scenes.id, id)).limit(1);

    if (result.length === 0) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    const row = result[0];
    const scene = JSON.parse(row.data);

    // Hydrate the image URL back into the scene for client convenience.
    // Modern scenes have an imageUrl column; legacy scenes may still have data URL in scene.image.data.
    if (row.imageUrl) {
      scene.image = { ...(scene.image || {}), data: row.imageUrl };
    }

    return NextResponse.json({ scene, imageUrl: row.imageUrl });
  } catch (error) {
    console.error("Failed to load scene:", error);
    return NextResponse.json({ error: "Failed to load scene" }, { status: 500 });
  }
}
