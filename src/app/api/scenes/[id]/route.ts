import { db } from "@/db";
import { scenes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await db.select().from(scenes).where(eq(scenes.id, id)).limit(1);

    if (result.length === 0) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    return NextResponse.json({ scene: JSON.parse(result[0].data) });
  } catch (error) {
    console.error("Failed to load scene:", error);
    return NextResponse.json({ error: "Failed to load scene" }, { status: 500 });
  }
}
