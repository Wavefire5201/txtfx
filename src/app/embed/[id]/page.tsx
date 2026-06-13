import { getDb } from "@/db";
import { scenes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { exportStandaloneHTML } from "@/engine/export/html";
import { hydrateSceneImage } from "@/lib/share-meta";
import { SceneViewer } from "@/components/SceneViewer";
import type { SceneData } from "@/engine/scene";

export default async function EmbedPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-z0-9]{8}$/.test(id)) return null;
  const rows = await getDb().select().from(scenes).where(eq(scenes.id, id)).limit(1).catch(() => []);
  const row = rows[0];
  if (!row) return null;
  const scene = hydrateSceneImage(JSON.parse(row.data) as SceneData, row.imageUrl);
  return <SceneViewer html={exportStandaloneHTML(scene)} id={id} chrome={false} />;
}
