import { getDb } from "@/db";
import { scenes } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { exportStandaloneHTML } from "@/engine/export/html";
import { buildSceneMetadata, hydrateSceneImage } from "@/lib/share-meta";
import { SceneViewer } from "@/components/SceneViewer";
import type { SceneData } from "@/engine/scene";

async function loadRow(id: string) {
  if (!/^[a-z0-9]{8}$/.test(id)) return null;
  const rows = await getDb().select().from(scenes).where(eq(scenes.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const row = await loadRow(id).catch(() => null);
  return buildSceneMetadata(id, row?.ogImageUrl ?? null);
}

function NotFound() {
  return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#0a0a0e", color: "#aaa", fontFamily: "system-ui" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 24, marginBottom: 8, color: "#fff" }}>Scene not found</h1>
        <p>This share link may have expired or been deleted.</p>
        <a href="/editor" style={{ color: "#7defa0", marginTop: 16, display: "inline-block" }}>Open Editor</a>
      </div>
    </div>
  );
}

export default async function SharePage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = await loadRow(id).catch(() => null);
  if (!row) return <NotFound />;

  const scene = hydrateSceneImage(JSON.parse(row.data) as SceneData, row.imageUrl);
  const html = exportStandaloneHTML(scene);
  return <SceneViewer html={html} id={id} chrome />;
}
