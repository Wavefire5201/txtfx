import { describe, it, expect, afterEach } from "vitest";
import { exportStandaloneHTML } from "./export/html";
import { fixtureScenes, makeTestImageDataUrl } from "@/test/fixtures";

// ---------------------------------------------------------------------------
// Loads a REAL exported standalone HTML in an iframe, with rAF instrumented,
// and verifies the player's loop discipline:
//  - it animates at a bounded rAF scheduling rate (single chain)
//  - resize storms do not stack additional loops (the historical leak)
//  - hiding the player stops scheduling (IntersectionObserver gate)
// ---------------------------------------------------------------------------

const RAF_COUNTER_SNIPPET = `<script>
  (function () {
    var count = 0;
    var orig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = function (cb) {
      return orig(function (ts) { count++; cb(ts); });
    };
    window.__rafCount = function () { return count; };
  })();
</script>`;

let iframe: HTMLIFrameElement | null = null;
afterEach(() => {
  iframe?.remove();
  iframe = null;
});

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function loadPlayerIframe(): Promise<HTMLIFrameElement> {
  const scene = fixtureScenes.effects();
  scene.image.data = makeTestImageDataUrl(320, 200);
  scene.playback = { duration: 10, fps: 30, loop: true };

  let html = exportStandaloneHTML(scene);
  // Hermetic: no Google Fonts fetches from the test
  html = html.replace(/<link[^>]*>/g, "");
  html = html.replace("<body>", `<body>${RAF_COUNTER_SNIPPET}`);

  const frame = document.createElement("iframe");
  frame.style.width = "640px";
  frame.style.height = "400px";
  frame.style.border = "0";
  document.body.appendChild(frame);
  frame.srcdoc = html;
  await new Promise<void>((resolve) => frame.addEventListener("load", () => resolve(), { once: true }));
  // Let buildAscii (async image decode) + playback start settle
  await wait(700);
  return frame;
}

interface PlayerWindow extends Window {
  __rafCount(): number;
}

async function rafRatePerSecond(frame: HTMLIFrameElement, sampleMs = 700): Promise<number> {
  const win = frame.contentWindow as PlayerWindow;
  const before = win.__rafCount();
  await wait(sampleMs);
  return ((win.__rafCount() - before) * 1000) / sampleMs;
}

describe("standalone player loop discipline", () => {
  it("animates with one rAF chain, survives resize storms, pauses off-screen", async () => {
    iframe = await loadPlayerIframe();
    const win = iframe.contentWindow as PlayerWindow;
    const doc = iframe.contentDocument!;

    // Base text was generated and playback is running
    expect(doc.getElementById("A")?.textContent?.length ?? 0).toBeGreaterThan(100);

    // Grid is centered in the container (symmetric padding), so the ASCII lines
    // up with the center-cropped backdrop rather than anchoring top-left.
    const a = doc.getElementById("A") as HTMLElement;
    expect(a.style.paddingLeft).toBe(a.style.paddingRight);
    expect(a.style.paddingTop).toBe(a.style.paddingBottom);
    // GL mode engaged in this chromium (WebGL2 available): GL canvas sized, pres hidden
    const glc = doc.getElementById("GLC") as HTMLCanvasElement | null;
    expect(glc).not.toBeNull();
    if (glc && glc.width > 0) {
      expect((doc.getElementById("A") as HTMLElement).style.visibility).toBe("hidden");
    }
    const baseline = await rafRatePerSecond(iframe);
    expect(baseline).toBeGreaterThan(10); // animating
    expect(baseline).toBeLessThan(130); // single chain (one vsync ~60-120Hz)

    // Resize storm: the historical bug stacked one loop per resize
    for (let i = 0; i < 5; i++) {
      win.dispatchEvent(new Event("resize"));
      await wait(30);
    }
    await wait(900); // debounce (150ms) + rebuild + settle
    const afterResize = await rafRatePerSecond(iframe);
    expect(afterResize).toBeLessThan(baseline * 1.8); // stacking would be ~6x

    // Off-screen: IntersectionObserver gate must stop scheduling
    iframe.style.display = "none";
    await wait(400); // IO callback + gate
    const hidden = await rafRatePerSecond(iframe, 500);
    expect(hidden).toBeLessThan(5);

    // Back on screen: resumes
    iframe.style.display = "";
    await wait(400);
    const resumed = await rafRatePerSecond(iframe, 500);
    expect(resumed).toBeGreaterThan(10);
  }, 20_000);
});
