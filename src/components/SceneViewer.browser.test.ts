import { describe, it, expect, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { SceneViewer } from "./SceneViewer";

let container: HTMLElement | null = null;
afterEach(() => {
  container?.remove();
  container = null;
});

describe("SceneViewer", () => {
  it("renders the player HTML inside a srcDoc iframe", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const html = "<!DOCTYPE html><html><body>hello-player</body></html>";
    root.render(createElement(SceneViewer, { html, id: "abc12345", chrome: false }));
    await new Promise((r) => setTimeout(r, 50));

    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute("srcdoc")).toContain("hello-player");
    root.unmount();
  });

  it("shows chrome controls when chrome=true", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    root.render(createElement(SceneViewer, { html: "<html></html>", id: "abc12345", chrome: true }));
    await new Promise((r) => setTimeout(r, 50));

    expect(container.textContent).toContain("Open in editor");
    root.unmount();
  });
});
