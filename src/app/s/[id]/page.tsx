import { db } from "@/db";
import { scenes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await db.select().from(scenes).where(eq(scenes.id, id)).limit(1);

  if (result.length === 0) {
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

  redirect(`/editor#shared=${id}`);
}
