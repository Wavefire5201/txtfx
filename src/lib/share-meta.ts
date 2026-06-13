import type { Metadata } from "next";
import type { SceneData } from "@/engine/scene";

/** Metadata for a shared-scene page, including OG/Twitter preview cards. */
export function buildSceneMetadata(
  id: string,
  ogImageUrl: string | null,
): Metadata {
  const title = "txtfx scene";
  const description = "An animated ASCII scene made with txtfx.";
  const images = ogImageUrl
    ? [{ url: ogImageUrl, width: 1200, height: 630 }]
    : undefined;
  return {
    title,
    description,
    openGraph: { title, description, type: "website", images },
    twitter: {
      card: ogImageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: images?.map((i) => i.url),
    },
  };
}

/** Merge the R2 image URL back into a stored scene (which has image.data="" ). */
export function hydrateSceneImage(
  scene: SceneData,
  imageUrl: string | null,
): SceneData {
  if (!imageUrl) return scene;
  return { ...scene, image: { ...scene.image, data: imageUrl } };
}
