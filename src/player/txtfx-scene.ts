import { resolveEmbedUrl } from "./embed-url";

// Origin the player script was served from — that's where /embed lives. Captured
// at load time from the <script> tag so a <txtfx-scene scene-id> on a third-party
// page resolves to the txtfx domain, not the host page.
const SCRIPT_ORIGIN = (() => {
  try {
    const cur = document.currentScript as HTMLScriptElement | null;
    if (cur?.src) return new URL(cur.src).origin;
  } catch {
    /* ignore */
  }
  return "";
})();

/**
 * <txtfx-scene scene-id="abc12345"></txtfx-scene>
 *
 * Drops a sandboxed iframe pointing at the hosted /embed/{id} player. Use `src`
 * to override with an explicit URL. Size it with normal CSS (the element is
 * display:block; the iframe fills it).
 */
class TxtfxScene extends HTMLElement {
  static get observedAttributes() {
    return ["scene-id", "src"];
  }

  private iframe: HTMLIFrameElement | null = null;

  connectedCallback() {
    if (!this.iframe) {
      if (!this.style.display) this.style.display = "block";
      const iframe = document.createElement("iframe");
      iframe.style.cssText =
        "width:100%;height:100%;border:0;display:block;background:#0a0a0e";
      iframe.setAttribute("sandbox", "allow-scripts");
      iframe.setAttribute("loading", "lazy");
      iframe.setAttribute("title", "txtfx scene");
      this.iframe = iframe;
      this.appendChild(iframe);
    }
    this.sync();
  }

  attributeChangedCallback() {
    if (this.iframe) this.sync();
  }

  private sync() {
    const url = resolveEmbedUrl({
      sceneId: this.getAttribute("scene-id"),
      src: this.getAttribute("src"),
      origin: SCRIPT_ORIGIN,
    });
    if (url && this.iframe && this.iframe.getAttribute("src") !== url) {
      this.iframe.setAttribute("src", url);
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("txtfx-scene")) {
  customElements.define("txtfx-scene", TxtfxScene);
}

export { TxtfxScene };
