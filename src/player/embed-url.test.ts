import { describe, it, expect } from "vitest";
import { resolveEmbedUrl, webComponentSnippet } from "./embed-url";

describe("resolveEmbedUrl", () => {
  it("resolves a scene-id against the script origin", () => {
    expect(resolveEmbedUrl({ sceneId: "abc12345", origin: "https://txtfx.app" }))
      .toBe("https://txtfx.app/embed/abc12345");
  });

  it("strips a trailing slash from the origin", () => {
    expect(resolveEmbedUrl({ sceneId: "abc12345", origin: "https://txtfx.app/" }))
      .toBe("https://txtfx.app/embed/abc12345");
  });

  it("prefers an explicit src over scene-id", () => {
    expect(resolveEmbedUrl({ sceneId: "abc12345", src: "https://x.test/custom", origin: "https://txtfx.app" }))
      .toBe("https://x.test/custom");
  });

  it("returns null for a missing/invalid scene-id and no src", () => {
    expect(resolveEmbedUrl({ origin: "https://txtfx.app" })).toBeNull();
    expect(resolveEmbedUrl({ sceneId: "BAD!", origin: "https://txtfx.app" })).toBeNull();
    expect(resolveEmbedUrl({ sceneId: "tooLongId123", origin: "https://txtfx.app" })).toBeNull();
  });
});

describe("webComponentSnippet", () => {
  it("emits a script tag + element using the scene id and origin", () => {
    const out = webComponentSnippet("abc12345", "https://txtfx.app");
    expect(out).toContain(`src="https://txtfx.app/v1/txtfx-scene.js"`);
    expect(out).toContain(`scene-id="abc12345"`);
  });
});
