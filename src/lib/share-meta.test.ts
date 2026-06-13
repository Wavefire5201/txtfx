import { describe, it, expect } from "vitest";
import { buildSceneMetadata, hydrateSceneImage } from "./share-meta";
import type { SceneData } from "@/engine/scene";

describe("share-meta", () => {
  it("builds OG + Twitter metadata pointing at the preview image", () => {
    const meta = buildSceneMetadata("abc12345", "https://cdn/x.jpg");
    expect(meta.openGraph?.images).toEqual([
      { url: "https://cdn/x.jpg", width: 1200, height: 630 },
    ]);
    expect(meta.twitter?.card).toBe("summary_large_image");
  });

  it("omits images when there is no preview", () => {
    const meta = buildSceneMetadata("abc12345", null);
    expect(meta.openGraph?.images).toBeUndefined();
  });

  it("hydrates the R2 image URL into scene.image.data", () => {
    const scene = { image: { data: "", width: 1, height: 1 } } as SceneData;
    const out = hydrateSceneImage(scene, "https://cdn/img.jpg");
    expect(out.image.data).toBe("https://cdn/img.jpg");
  });

  it("leaves the scene untouched when imageUrl is null", () => {
    const scene = { image: { data: "x", width: 1, height: 1 } } as SceneData;
    const out = hydrateSceneImage(scene, null);
    expect(out.image.data).toBe("x");
  });
});
