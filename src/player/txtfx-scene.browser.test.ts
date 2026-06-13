import { describe, it, expect, afterEach } from "vitest";
import "./txtfx-scene";

let el: HTMLElement | null = null;
afterEach(() => {
  el?.remove();
  el = null;
});

describe("<txtfx-scene>", () => {
  it("registers as a custom element", () => {
    expect(customElements.get("txtfx-scene")).toBeTruthy();
  });

  it("creates a sandboxed iframe pointing at /embed/{id}", async () => {
    el = document.createElement("txtfx-scene");
    el.setAttribute("scene-id", "abc12345");
    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 0));

    const iframe = el.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute("src")).toContain("/embed/abc12345");
    expect(iframe!.getAttribute("sandbox")).toBe("allow-scripts");
  });

  it("updates the iframe src when scene-id changes", async () => {
    el = document.createElement("txtfx-scene");
    el.setAttribute("scene-id", "abc12345");
    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 0));

    el.setAttribute("scene-id", "zzzz0000");
    await new Promise((r) => setTimeout(r, 0));

    const iframe = el.querySelector("iframe");
    expect(iframe!.getAttribute("src")).toContain("/embed/zzzz0000");
  });
});
