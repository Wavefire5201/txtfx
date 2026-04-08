import { db } from "@/db";
import { scenes } from "@/db/schema";
import { NextResponse } from "next/server";

function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.scene || !body.scene.version) {
      return NextResponse.json({ error: "Invalid scene data" }, { status: 400 });
    }

    const id = generateId();
    const data = JSON.stringify(body.scene);

    // Limit scene size (5MB max)
    if (data.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Scene too large (max 5MB)" }, { status: 413 });
    }

    await db.insert(scenes).values({ id, data });

    return NextResponse.json({ id, url: `/s/${id}` });
  } catch (error) {
    console.error("Failed to save scene:", error);
    return NextResponse.json({ error: "Failed to save scene" }, { status: 500 });
  }
}
