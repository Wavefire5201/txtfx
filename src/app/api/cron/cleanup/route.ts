import { getDb } from "@/db";
import { scenes } from "@/db/schema";
import { and, eq, lt, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { deleteObject, keyFromUrl } from "@/lib/r2";
import { shouldDeleteImage } from "@/lib/cleanup";

export async function GET(request: Request) {
  // Auth: Vercel Cron sends Authorization: Bearer $CRON_SECRET.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const retentionDays = Number(process.env.SCENE_RETENTION_DAYS || "0");
  if (retentionDays <= 0) {
    return NextResponse.json({ ok: true, disabled: true, deleted: 0 });
  }

  const db = getDb();
  const cutoff = sql`NOW() - (${retentionDays} || ' days')::interval`;
  const expired = await db
    .select({ id: scenes.id, imageHash: scenes.imageHash, imageUrl: scenes.imageUrl })
    .from(scenes)
    .where(lt(scenes.createdAt, cutoff))
    .limit(500);

  let imagesDeleted = 0;
  for (const row of expired) {
    await db.delete(scenes).where(eq(scenes.id, row.id));
    if (row.imageHash && row.imageUrl) {
      const refs = await db
        .select({ id: scenes.id })
        .from(scenes)
        .where(and(eq(scenes.imageHash, row.imageHash), ne(scenes.id, row.id)))
        .limit(1);
      if (shouldDeleteImage(refs.length)) {
        const key = keyFromUrl(row.imageUrl);
        if (key) {
          try { await deleteObject(key); imagesDeleted++; } catch { /* best-effort */ }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, deleted: expired.length, imagesDeleted });
}
