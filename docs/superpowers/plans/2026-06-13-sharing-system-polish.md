# Sharing System Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden and polish txtfx's scene-sharing system — fix the mask-loss bug, add CORS + immutable caching, add social/OG previews, turn `/s/<id>` into a real read-only viewer, allow imageless shares, and add an optional TTL cleanup — so it is correct, fast, embeddable, and ready to host the upcoming CDN player.

**Architecture:** Scenes live in Neon Postgres (`scenes` table, scene JSON minus image); images are content-addressed in R2 (`images/<sha256>.<ext>`, 1yr immutable). The share write path uploads image → R2, POSTs scene metadata, content-hash dedups. The polish keeps that pipeline and adds: a shared scene-apply helper (restores the runtime `Mask`), reusable CORS/cache HTTP helpers on the read API, a client-rendered OG still captured via the existing export pipeline and stored in a new `og_image_url` column, and a `/s/<id>` page that renders the existing standalone-HTML player inside an `<iframe srcDoc>` (zero new render code) with a chrome overlay, plus a chrome-less `/embed/<id>`.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, **bun** (never npm), Drizzle ORM + Neon, Cloudflare R2 via `@aws-sdk/client-s3`, Vitest (unit `--project unit` / browser `--project browser`). Tests: `bun run test`, `bun run test:browser`, `bun run test:all`. Lint: `bun run lint`. Build: `bun run build`.

---

## Conventions for every task

- **Never** run bare `bun test` (invokes bun's own runner). Use `bun run test` / `bun run test:browser`.
- Verify build/lint by **running** the command and reading output — never assert success from edits alone.
- Commit at the end of each task with the shown message. Branch off `main` first (Task 0).
- Pure helpers get real failing-test-first unit tests. UI/integration/ops steps that can't be honestly unit-tested get an explicit **manual verification** step instead of a fake test — this is intentional and matches the repo's golden/eyeball convention.

---

## File Structure

**New files**
- `src/lib/apply-scene.ts` — `applySharedScene(scene)`: loads a shared/imported scene into the store *and* restores the runtime `Mask` (the missing piece behind the mask bug).
- `src/lib/http.ts` — `CORS_HEADERS`, `IMMUTABLE_CACHE`, `mergeCorsHeaders()`, `jsonWithCors()`, `corsPreflight()`.
- `src/lib/share-meta.ts` — pure `buildSceneMetadata()` + `hydrateSceneImage()` helpers used by the viewer page.
- `src/components/SceneViewer.tsx` — client component: full-viewport `<iframe srcDoc>` player + chrome overlay (Open in editor / Copy link / Embed).
- `src/app/embed/[id]/page.tsx` — chrome-less viewer for clean embeds.
- `scripts/setup-r2-cors.ts` — one-shot: apply a permissive GET CORS policy to the R2 bucket (so cross-origin `getImageData` doesn't taint the canvas).
- `scripts/db-add-og-column.ts` — idempotent `ALTER TABLE scenes ADD COLUMN IF NOT EXISTS og_image_url text;`.
- `src/app/api/cron/cleanup/route.ts` — optional TTL cleanup (default disabled).
- `src/lib/cleanup.ts` — pure `isExpired()` / `shouldDeleteImage()` helpers for the cron.

**Modified files**
- `src/engine/mask.ts` — add `static fromBase64Auto(dataUrl)` (infers dimensions from the PNG).
- `src/components/editor/Canvas.tsx` — `#shared=` and `#scene=` load paths call `applySharedScene`; modernize the base64 decode.
- `src/app/api/scenes/[id]/route.ts` — CORS + immutable `Cache-Control` + `OPTIONS`.
- `src/app/api/scenes/route.ts` — accept/store `ogImageUrl`; collision-retry on insert.
- `src/db/schema.ts` — add `ogImageUrl` column.
- `src/lib/image-upload.ts` — factor out `uploadBlobToR2(blob)`; reuse it from `uploadImageToR2`.
- `src/components/editor/Toolbar.tsx` — `handleShare`: capture+upload OG still, send `ogImageUrl`; allow imageless shares.
- `src/app/s/[id]/page.tsx` — replace the redirect with a real viewer + `generateMetadata` (OG/Twitter).
- `vercel.json` (create or modify) — cron schedule for cleanup.

---

## Phase 1 — Fix the mask-loss bug (correctness)

Shared/imported scenes carry `scene.mask.data` (a base64 PNG) but `setScene` never rebuilds the runtime `Mask`. Only the localStorage path calls `Mask.fromBase64`. Result: opening a share drops masked regions.

### Task 0: Branch

- [ ] **Step 1: Create the working branch**

Run:
```bash
git checkout main && git pull --ff-only 2>/dev/null; git checkout -b feat/sharing-polish
```
Expected: `Switched to a new branch 'feat/sharing-polish'`.

### Task 1: `Mask.fromBase64Auto`

**Files:**
- Modify: `src/engine/mask.ts` (after `fromBase64`, ~line 176)
- Test: `src/engine/mask.browser.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/engine/mask.browser.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { Mask } from "./mask";

describe("Mask.fromBase64Auto", () => {
  it("round-trips a mask without needing explicit dimensions", async () => {
    const src = new Mask(6, 4);
    // Make an asymmetric pattern so a transpose/size bug would show.
    for (let i = 0; i < src.data.length; i++) src.data[i] = (i * 17) % 256;
    const url = src.toBase64();

    const restored = await Mask.fromBase64Auto(url);

    expect(restored.width).toBe(6);
    expect(restored.height).toBe(4);
    expect(Array.from(restored.data)).toEqual(Array.from(src.data));
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `bun run test:browser -- mask.browser`
Expected: FAIL — `Mask.fromBase64Auto is not a function`.

- [ ] **Step 3: Implement `fromBase64Auto`**

In `src/engine/mask.ts`, add this method right after `fromBase64` (before the closing `}` of `class Mask`):
```ts
  /** Load a mask from a base64 grayscale PNG, inferring width/height from the
   * decoded image (shared scenes don't carry mask dimensions separately). */
  static fromBase64Auto(dataUrl: string): Promise<Mask> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, w, h).data;
        const mask = new Mask(w, h);
        for (let i = 0; i < mask.data.length; i++) mask.data[i] = d[i * 4];
        resolve(mask);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }
```

- [ ] **Step 4: Run it; verify it passes**

Run: `bun run test:browser -- mask.browser`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/mask.ts src/engine/mask.browser.test.ts
git commit -m "feat(mask): fromBase64Auto infers dimensions from the PNG"
```

### Task 2: `applySharedScene` helper + wire into load paths

**Files:**
- Create: `src/lib/apply-scene.ts`
- Modify: `src/components/editor/Canvas.tsx:104-138`

- [ ] **Step 1: Create the helper**

Create `src/lib/apply-scene.ts`:
```ts
import { useEditorStore } from "./store";
import { Mask } from "@/engine/mask";
import type { SceneData } from "@/engine/scene";

/**
 * Load a scene received from a share link / URL hash into the editor store.
 * Unlike a bare setScene, this also rebuilds the runtime Mask from the scene's
 * base64 PNG — otherwise masked regions are silently dropped on shared scenes.
 */
export async function applySharedScene(scene: SceneData): Promise<void> {
  const store = useEditorStore.getState();
  store.setScene(scene);
  if (scene.image?.data) store.setImageUrl(scene.image.data);
  if (scene.mask?.data) {
    try {
      const mask = await Mask.fromBase64Auto(scene.mask.data);
      useEditorStore.getState().setMask(mask);
    } catch {
      /* corrupt mask data — leave the scene mask-less rather than crash */
    }
  }
}
```

- [ ] **Step 2: Wire it into the `#shared=` path**

In `src/components/editor/Canvas.tsx`, add the import near the other store imports at the top of the file:
```ts
import { applySharedScene } from "@/lib/apply-scene";
```

Replace the `#shared=` `.then(data => { ... })` body (currently `Canvas.tsx:113-118`) with:
```ts
          .then(data => {
            if (data.scene) applySharedScene(data.scene);
          })
```

- [ ] **Step 3: Wire it into the `#scene=` path and modernize the decode**

Replace the `#scene=` block body (currently `Canvas.tsx:127-137`) with:
```ts
      if (hash.startsWith("#scene=")) {
        const encoded = hash.slice(7);
        const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
        const json = new TextDecoder().decode(bytes);
        const data = JSON.parse(json);
        if (data.version) {
          applySharedScene(data);
          window.history.replaceState(null, "", window.location.pathname);
          return; // Skip localStorage restore
        }
      }
```

- [ ] **Step 4: Verify build + lint**

Run: `bun run lint 2>&1 | tail -8 && echo "===BUILD===" && bun run build 2>&1 | tail -6`
Expected: lint clean (pre-existing Canvas warnings excepted); build completes (`Compiled successfully` / no TS errors). Note: build runs `build:player` first.

- [ ] **Step 5: Manual verification**

Run `bun run dev`. In the editor: load an image, paint a mask, set one effect's maskRegion to "foreground", Share → copy link. Open the link in a new tab → the editor loads with the mask intact (the masked effect renders only in the painted region). Before this fix, the effect rendered everywhere.

- [ ] **Step 6: Commit**

```bash
git add src/lib/apply-scene.ts src/components/editor/Canvas.tsx
git commit -m "fix(share): restore runtime mask when loading shared/imported scenes"
```

---

## Phase 2 — CORS + immutable caching on the read API

Scenes are immutable once created (content-hash dedup → a given ID never changes). The read endpoint should be CDN-cacheable and CORS-open so cross-origin embeds (and the future CDN player) can fetch by ID. R2 images also need GET CORS so the player's `getImageData` doesn't taint the canvas.

### Task 3: HTTP helpers

**Files:**
- Create: `src/lib/http.ts`
- Test: `src/lib/http.test.ts` (create, unit)

- [ ] **Step 1: Write the failing test**

Create `src/lib/http.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { CORS_HEADERS, IMMUTABLE_CACHE, mergeCorsHeaders } from "./http";

describe("http helpers", () => {
  it("CORS headers allow cross-origin GET", () => {
    expect(CORS_HEADERS["Access-Control-Allow-Origin"]).toBe("*");
    expect(CORS_HEADERS["Access-Control-Allow-Methods"]).toContain("GET");
  });

  it("immutable cache marks the response cacheable forever", () => {
    expect(IMMUTABLE_CACHE).toContain("immutable");
    expect(IMMUTABLE_CACHE).toContain("max-age=");
  });

  it("mergeCorsHeaders overlays extra headers without losing CORS", () => {
    const merged = mergeCorsHeaders({ "Cache-Control": IMMUTABLE_CACHE });
    expect(merged["Access-Control-Allow-Origin"]).toBe("*");
    expect(merged["Cache-Control"]).toBe(IMMUTABLE_CACHE);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `bun run test -- http`
Expected: FAIL — cannot find module `./http`.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/http.ts`:
```ts
import { NextResponse } from "next/server";

/** Permissive CORS for public, read-only scene/embed endpoints. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/** Scenes never change once created (content-hash dedup), so cache forever. */
export const IMMUTABLE_CACHE =
  "public, max-age=31536000, s-maxage=31536000, immutable";

/** Don't cache error responses. */
export const NO_STORE = "no-store";

export function mergeCorsHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  return { ...CORS_HEADERS, ...(extra ?? {}) };
}

export function jsonWithCors(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): NextResponse {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: mergeCorsHeaders(init?.headers),
  });
}

/** 204 preflight response for OPTIONS. */
export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `bun run test -- http`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/http.ts src/lib/http.test.ts
git commit -m "feat(http): reusable CORS + immutable-cache response helpers"
```

### Task 4: Apply CORS + caching to `GET /api/scenes/[id]`

**Files:**
- Modify: `src/app/api/scenes/[id]/route.ts`

- [ ] **Step 1: Import the helpers**

In `src/app/api/scenes/[id]/route.ts`, add after the existing imports:
```ts
import { jsonWithCors, corsPreflight, IMMUTABLE_CACHE, NO_STORE } from "@/lib/http";
```

- [ ] **Step 2: Add the OPTIONS preflight handler**

Add at the top of the file's exports (above `GET`):
```ts
export function OPTIONS() {
  return corsPreflight();
}
```

- [ ] **Step 3: Convert every response to CORS-aware**

Replace each `NextResponse.json(...)` in `GET` as follows:
- Rate-limit 429: `return jsonWithCors({ error: "Too many requests. Please try again later." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), "Cache-Control": NO_STORE } });`
- Invalid id 400: `return jsonWithCors({ error: "Invalid scene id" }, { status: 400, headers: { "Cache-Control": NO_STORE } });`
- Not found 404: `return jsonWithCors({ error: "Scene not found" }, { status: 404, headers: { "Cache-Control": NO_STORE } });`
- Success: `return jsonWithCors({ scene, imageUrl: row.imageUrl }, { headers: { "Cache-Control": IMMUTABLE_CACHE } });`
- Catch 500: `return jsonWithCors({ error: "Failed to load scene" }, { status: 500, headers: { "Cache-Control": NO_STORE } });`

Remove the now-unused `NextResponse` import if nothing else uses it (the linter will flag it).

- [ ] **Step 4: Verify build + lint**

Run: `bun run lint 2>&1 | tail -8 && echo "===BUILD===" && bun run build 2>&1 | tail -6`
Expected: clean.

- [ ] **Step 5: Manual verification**

`bun run dev`, then in another shell:
```bash
curl -s -D - -o /dev/null http://localhost:3000/api/scenes/zzzzzzzz | grep -i "access-control\|cache-control"
```
Expected: a 404 still carries `access-control-allow-origin: *` and `cache-control: no-store`. (Use a real shared id to see `immutable`.) Also:
```bash
curl -s -X OPTIONS -D - -o /dev/null http://localhost:3000/api/scenes/zzzzzzzz | grep -i "HTTP/\|access-control"
```
Expected: `204` with the CORS headers.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/scenes/[id]/route.ts
git commit -m "feat(api): CORS + immutable caching on scene reads"
```

### Task 5: R2 bucket CORS (ops script)

**Files:**
- Create: `scripts/setup-r2-cors.ts`

- [ ] **Step 1: Write the script**

Create `scripts/setup-r2-cors.ts`:
```ts
/**
 * One-shot: apply a permissive GET CORS policy to the R2 bucket so the embedded
 * player can read pixels (getImageData) from cross-origin image URLs without
 * tainting the canvas. Run with: bun scripts/setup-r2-cors.ts
 */
import "dotenv/config";
import { PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { r2, BUCKET } from "../src/lib/r2";

if (!BUCKET) {
  console.error("R2 not configured (missing env vars). Aborting.");
  process.exit(1);
}

await r2.send(
  new PutBucketCorsCommand({
    Bucket: BUCKET,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedMethods: ["GET", "HEAD"],
          AllowedOrigins: ["*"],
          AllowedHeaders: ["*"],
          ExposeHeaders: ["Content-Length", "Content-Type"],
          MaxAgeSeconds: 86400,
        },
      ],
    },
  }),
);

console.log(`R2 CORS policy applied to bucket "${BUCKET}".`);
```

- [ ] **Step 2: Run it**

Run: `bun scripts/setup-r2-cors.ts`
Expected: `R2 CORS policy applied to bucket "<name>".` (If env vars are absent in this environment, note that and defer running until R2 creds are present — the script is idempotent.)

- [ ] **Step 3: Manual verification**

With a known R2 image URL `$IMG`:
```bash
curl -s -D - -o /dev/null -H "Origin: https://example.com" "$IMG" | grep -i access-control-allow-origin
```
Expected: `access-control-allow-origin: *`.

- [ ] **Step 4: Commit**

```bash
git add scripts/setup-r2-cors.ts
git commit -m "chore(r2): script to apply GET CORS policy to the image bucket"
```

---

## Phase 3 — Social / OG previews

At share time the client already has a live scene; render one composited still via the existing export pipeline, upload it to R2, and store its URL in a new `og_image_url` column. `/s/<id>` then advertises it via `generateMetadata`.

### Task 6: `og_image_url` column

**Files:**
- Modify: `src/db/schema.ts`
- Create: `scripts/db-add-og-column.ts`

- [ ] **Step 1: Add the column to the schema**

In `src/db/schema.ts`, inside the `scenes` table definition, add after the `contentHash` line:
```ts
  // Public URL of a pre-rendered OG/social preview still (R2). Nullable.
  ogImageUrl: text("og_image_url"),
```

- [ ] **Step 2: Write the idempotent migration script**

Create `scripts/db-add-og-column.ts`:
```ts
/** Idempotent: add the og_image_url column. Run: bun scripts/db-add-og-column.ts */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set. Aborting.");
  process.exit(1);
}
const sql = neon(url);
await sql`ALTER TABLE scenes ADD COLUMN IF NOT EXISTS og_image_url text;`;
console.log("Column og_image_url ensured on scenes.");
```

- [ ] **Step 3: Run it**

Run: `bun scripts/db-add-og-column.ts`
Expected: `Column og_image_url ensured on scenes.` (Defer if DATABASE_URL is absent here; idempotent so safe to re-run.)

- [ ] **Step 4: Verify build**

Run: `bun run build 2>&1 | tail -6`
Expected: clean (schema type change compiles).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts scripts/db-add-og-column.ts
git commit -m "feat(db): add og_image_url column for social previews"
```

### Task 7: Reusable blob upload

**Files:**
- Modify: `src/lib/image-upload.ts`

- [ ] **Step 1: Factor out `uploadBlobToR2`**

In `src/lib/image-upload.ts`, add this exported function (place it above `uploadImageToR2`):
```ts
/** Hash a blob, get a presigned URL (or reuse an existing object), PUT it. */
export async function uploadBlobToR2(blob: Blob): Promise<UploadResult> {
  const hash = await hashBlob(blob);
  const prepRes = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hash, contentType: blob.type, size: blob.size }),
  });
  if (!prepRes.ok) {
    const err = await prepRes.json().catch(() => ({ error: "Upload prepare failed" }));
    throw new Error(err.error || "Upload prepare failed");
  }
  const { uploadUrl, publicUrl, existing } = (await prepRes.json()) as {
    uploadUrl?: string;
    publicUrl: string;
    existing: boolean;
  };
  if (!existing && uploadUrl) {
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": blob.type },
      body: blob,
    });
    if (!putRes.ok) {
      const text = await putRes.text().catch(() => "");
      throw new Error(`R2 upload failed: ${putRes.status} ${text}`);
    }
  }
  return { publicUrl, hash, bytes: blob.size };
}
```

- [ ] **Step 2: Make `uploadImageToR2` reuse it**

Replace the body of `uploadImageToR2` (from its `// 2. Hash for dedup` comment through the `return` at the end) with:
```ts
  // 2-5. Hash, presign, PUT (shared with OG upload)
  return uploadBlobToR2(compressed);
```
So the function becomes: fetch → compress → `return uploadBlobToR2(compressed)`.

- [ ] **Step 3: Verify build + lint**

Run: `bun run lint 2>&1 | tail -8 && echo "===BUILD===" && bun run build 2>&1 | tail -6`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/image-upload.ts
git commit -m "refactor(upload): extract reusable uploadBlobToR2"
```

### Task 8: Capture + send the OG still in `handleShare`

**Files:**
- Modify: `src/components/editor/Toolbar.tsx` (imports + `handleShare`)
- Modify: `src/app/api/scenes/route.ts` (accept/store `ogImageUrl`)

- [ ] **Step 1: Imports in Toolbar**

In `src/components/editor/Toolbar.tsx`, ensure these are imported (add `uploadBlobToR2`; `exportStillAuto` is already imported):
```ts
import { uploadImageToR2, uploadBlobToR2 } from "@/lib/image-upload";
```

- [ ] **Step 2: Render + upload the OG still inside `handleShare`**

In `handleShare`, immediately **after** the image upload succeeds (after the `uploaded = await uploadImageToR2(imageUrl)` try/catch block, before building `sceneToShare`), insert:
```ts
      // Render a 1200x630 social preview from the live scene (best-effort).
      let ogImageUrl: string | null = null;
      try {
        const img = await loadExportImage();
        const currentMask = useEditorStore.getState().mask;
        const dur = scene.playback?.duration ?? 10;
        const ogBlob = await exportStillAuto(getExportScene(), img, currentMask, {
          width: 1200,
          height: 630,
          time: Math.min(2, dur / 2),
          type: "image/jpeg",
          quality: 0.85,
          transparent: false,
        });
        ogImageUrl = (await uploadBlobToR2(ogBlob)).publicUrl;
      } catch (err) {
        console.warn("OG preview render failed (continuing without it):", err);
      }
```

- [ ] **Step 3: Send `ogImageUrl` in the POST body**

In the `POST /api/scenes` `fetch` call inside `handleShare`, add `ogImageUrl` to the JSON body:
```ts
        body: JSON.stringify({
          scene: sceneToShare,
          imageUrl: uploaded.publicUrl,
          imageHash: uploaded.hash,
          ogImageUrl,
        }),
```

- [ ] **Step 4: Persist `ogImageUrl` server-side**

In `src/app/api/scenes/route.ts` `POST`:
- After the `imageHash` line, add:
  ```ts
    const ogImageUrl = typeof body.ogImageUrl === "string" ? body.ogImageUrl : null;
  ```
- In the `db.insert(scenes).values({...})` call, add `ogImageUrl`:
  ```ts
    await db.insert(scenes).values({ id, data, imageUrl, imageHash, contentHash, ogImageUrl });
  ```

- [ ] **Step 5: Verify build + lint**

Run: `bun run lint 2>&1 | tail -8 && echo "===BUILD===" && bun run build 2>&1 | tail -6`
Expected: clean.

- [ ] **Step 6: Manual verification**

`bun run dev`, share a scene, then check the DB row has a non-null `og_image_url` and the URL opens a 1200×630 JPEG of the scene. (`curl -sI "$OG_URL"` → `200`, `content-type: image/jpeg`.)

- [ ] **Step 7: Commit**

```bash
git add src/components/editor/Toolbar.tsx src/app/api/scenes/route.ts
git commit -m "feat(share): render + store a 1200x630 OG preview still"
```

### Task 9: `generateMetadata` on `/s/[id]`

> This task also begins replacing the page; it is completed by Task 11. Here we only add the metadata helper + export. The page body is rewritten in Task 11.

**Files:**
- Create: `src/lib/share-meta.ts`
- Test: `src/lib/share-meta.test.ts` (create, unit)

- [ ] **Step 1: Write the failing test**

Create `src/lib/share-meta.test.ts`:
```ts
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
```

- [ ] **Step 2: Run it; verify it fails**

Run: `bun run test -- share-meta`
Expected: FAIL — cannot find module `./share-meta`.

- [ ] **Step 3: Implement**

Create `src/lib/share-meta.ts`:
```ts
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
```

- [ ] **Step 4: Run it; verify it passes**

Run: `bun run test -- share-meta`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/share-meta.ts src/lib/share-meta.test.ts
git commit -m "feat(share): pure helpers for scene OG metadata + image hydration"
```

---

## Phase 4 — Read-only viewer (`/s/[id]`) + chrome-less `/embed/[id]`

Replace the editor redirect with a page that fetches the scene once (no client re-fetch), hydrates the image URL, and renders the **existing** standalone-HTML player inside an `<iframe srcDoc>` — reusing the fully-tested player IIFE with zero new render code. The viewer adds a small chrome overlay; `/embed/[id]` renders the same iframe with no chrome.

### Task 10: `SceneViewer` client component

**Files:**
- Create: `src/components/SceneViewer.tsx`
- Test: `src/components/SceneViewer.browser.test.ts` (create, browser)

- [ ] **Step 1: Write the failing test**

Create `src/components/SceneViewer.browser.test.ts`:
```ts
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
    await new Promise((r) => setTimeout(r, 0));

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
    await new Promise((r) => setTimeout(r, 0));

    expect(container.textContent).toContain("Open in editor");
    root.unmount();
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `bun run test:browser -- SceneViewer`
Expected: FAIL — cannot find module `./SceneViewer`.

- [ ] **Step 3: Implement the component**

Create `src/components/SceneViewer.tsx`:
```tsx
"use client";

import { useState } from "react";

export interface SceneViewerProps {
  /** Full standalone-player HTML document (from exportStandaloneHTML). */
  html: string;
  /** Scene short id (for the editor + embed links). */
  id: string;
  /** Show the overlay chrome (Open in editor / Copy link / Embed). */
  chrome?: boolean;
}

export function SceneViewer({ html, id, chrome = true }: SceneViewerProps) {
  const [copied, setCopied] = useState<"" | "link" | "embed">("");

  function copy(kind: "link" | "embed") {
    const origin = window.location.origin;
    const text =
      kind === "link"
        ? `${origin}/s/${id}`
        : `<iframe src="${origin}/embed/${id}" style="width:100%;height:100%;border:0" allowfullscreen></iframe>`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(""), 1500);
    });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0a0a0e" }}>
      <iframe
        title="txtfx scene"
        srcDoc={html}
        sandbox="allow-scripts"
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
      />
      {chrome && (
        <div
          style={{
            position: "fixed",
            top: 12,
            right: 12,
            display: "flex",
            gap: 8,
            fontFamily: "system-ui",
            fontSize: 12,
          }}
        >
          <a href={`/editor#shared=${id}`} style={btn}>Open in editor</a>
          <button onClick={() => copy("link")} style={btn}>
            {copied === "link" ? "Copied!" : "Copy link"}
          </button>
          <button onClick={() => copy("embed")} style={btn}>
            {copied === "embed" ? "Copied!" : "Embed"}
          </button>
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  background: "rgba(26,26,31,.85)",
  color: "#cfcfd6",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 8,
  padding: "6px 12px",
  cursor: "pointer",
  backdropFilter: "blur(8px)",
  textDecoration: "none",
};
```

- [ ] **Step 4: Run it; verify it passes**

Run: `bun run test:browser -- SceneViewer`
Expected: PASS (2 tests). If `react-dom/client` import fails in the browser project, swap to mounting via the project's existing test util pattern used by other `*.browser.test.ts` files (check one for the canonical mount approach) — keep the same assertions.

- [ ] **Step 5: Commit**

```bash
git add src/components/SceneViewer.tsx src/components/SceneViewer.browser.test.ts
git commit -m "feat(viewer): SceneViewer iframe player with optional chrome"
```

### Task 11: Rewrite `/s/[id]` as a viewer + `generateMetadata`

**Files:**
- Modify (rewrite): `src/app/s/[id]/page.tsx`

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `src/app/s/[id]/page.tsx` with:
```tsx
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
```

- [ ] **Step 2: Verify build + lint**

Run: `bun run lint 2>&1 | tail -8 && echo "===BUILD===" && bun run build 2>&1 | tail -6`
Expected: clean. (`exportStandaloneHTML` pulls in `player-bundle.ts`; `build` runs `build:player` first so it exists.)

- [ ] **Step 3: Manual verification**

`bun run dev`, open `/s/<realId>`: the scene plays in an iframe with the overlay (Open in editor / Copy link / Embed). "Open in editor" loads `/editor#shared=<id>`. View page source → `<meta property="og:image">` points at the OG URL.

- [ ] **Step 4: Commit**

```bash
git add src/app/s/[id]/page.tsx
git commit -m "feat(viewer): render shared scenes read-only with OG metadata"
```

### Task 12: Chrome-less `/embed/[id]`

**Files:**
- Create: `src/app/embed/[id]/page.tsx`

- [ ] **Step 1: Create the embed page**

Create `src/app/embed/[id]/page.tsx`:
```tsx
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
```

- [ ] **Step 2: Verify build**

Run: `bun run build 2>&1 | tail -6`
Expected: clean; `/embed/[id]` appears in the route list as a dynamic route.

- [ ] **Step 3: Manual verification**

Open `/embed/<realId>`: the scene plays full-bleed with no overlay. The "Embed" button on `/s/<id>` copies an `<iframe src=".../embed/<id>">` snippet — paste into a scratch HTML file and confirm it renders cross-context.

- [ ] **Step 4: Commit**

```bash
git add src/app/embed/[id]/page.tsx
git commit -m "feat(embed): chrome-less /embed/[id] player route"
```

---

## Phase 5 — Cleanups: imageless shares + collision-safe IDs

### Task 13: Allow imageless shares

**Files:**
- Modify: `src/components/editor/Toolbar.tsx` (`handleShare`)

- [ ] **Step 1: Make the image optional**

In `handleShare`, replace the early `if (!imageUrl) { toast(...); return; }` guard and the image-upload block so an imageless scene still shares:
```ts
      setSharing(true);

      // Image is optional — pure-effect scenes can be shared too.
      let uploadedImageUrl: string | null = null;
      let uploadedImageHash: string | null = null;
      if (imageUrl) {
        toast("Uploading image...");
        try {
          const uploaded = await uploadImageToR2(imageUrl);
          uploadedImageUrl = uploaded.publicUrl;
          uploadedImageHash = uploaded.hash;
        } catch (err) {
          console.error("Image upload failed:", err);
          toast("Image upload failed", "warning");
          return;
        }
      }
```

- [ ] **Step 2: Guard the OG capture on having an image**

Wrap the OG block (from Task 8) so it only runs when `imageUrl` exists:
```ts
      let ogImageUrl: string | null = null;
      if (imageUrl) {
        try {
          const img = await loadExportImage();
          const currentMask = useEditorStore.getState().mask;
          const dur = scene.playback?.duration ?? 10;
          const ogBlob = await exportStillAuto(getExportScene(), img, currentMask, {
            width: 1200, height: 630, time: Math.min(2, dur / 2),
            type: "image/jpeg", quality: 0.85, transparent: false,
          });
          ogImageUrl = (await uploadBlobToR2(ogBlob)).publicUrl;
        } catch (err) {
          console.warn("OG preview render failed (continuing without it):", err);
        }
      }
```

- [ ] **Step 3: Use the new variables in the POST body + sceneToShare**

Update `sceneToShare.image.data` to `""` (unchanged) and the POST body to:
```ts
        body: JSON.stringify({
          scene: sceneToShare,
          imageUrl: uploadedImageUrl,
          imageHash: uploadedImageHash,
          ogImageUrl,
        }),
```

- [ ] **Step 4: Verify build + lint**

Run: `bun run lint 2>&1 | tail -8 && echo "===BUILD===" && bun run build 2>&1 | tail -6`
Expected: clean.

- [ ] **Step 5: Manual verification**

`bun run dev`: with **no image loaded**, add an effect (e.g. matrix), Share → link copied, opening it plays the effect over the dark background. With an image, behavior is unchanged (image + OG present).

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/Toolbar.tsx
git commit -m "feat(share): allow sharing imageless (pure-effect) scenes"
```

### Task 14: Collision-safe ID generation

**Files:**
- Modify: `src/app/api/scenes/route.ts`

- [ ] **Step 1: Retry insert on ID collision**

In `POST`, replace the single `const id = generateId(); await db.insert(...)` with a bounded retry that regenerates the id on a unique-constraint violation:
```ts
    let id = "";
    let inserted = false;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      id = generateId();
      try {
        await db.insert(scenes).values({ id, data, imageUrl, imageHash, contentHash, ogImageUrl });
        inserted = true;
      } catch (e) {
        // Unique violation on the PK → regenerate and retry; rethrow anything else.
        const code = (e as { code?: string })?.code;
        if (code !== "23505") throw e;
      }
    }
    if (!inserted) {
      return NextResponse.json({ error: "Could not allocate a share id, try again" }, { status: 503 });
    }
```

- [ ] **Step 2: Verify build + lint**

Run: `bun run lint 2>&1 | tail -8 && echo "===BUILD===" && bun run build 2>&1 | tail -6`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/scenes/route.ts
git commit -m "fix(api): retry scene id generation on collision"
```

---

## Phase 6 — Optional TTL cleanup (default disabled)

Mechanism only; off unless `SCENE_RETENTION_DAYS` is set > 0. Deletes expired scenes and, when an image hash is no longer referenced by any remaining scene, removes the orphaned R2 object.

### Task 15: Cleanup helpers

**Files:**
- Create: `src/lib/cleanup.ts`
- Test: `src/lib/cleanup.test.ts` (create, unit)

- [ ] **Step 1: Write the failing test**

Create `src/lib/cleanup.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isExpired, shouldDeleteImage } from "./cleanup";

describe("cleanup helpers", () => {
  const now = new Date("2026-06-13T00:00:00Z");

  it("never expires when retentionDays <= 0", () => {
    const old = new Date("2000-01-01T00:00:00Z");
    expect(isExpired(old, 0, now)).toBe(false);
    expect(isExpired(old, -5, now)).toBe(false);
  });

  it("expires rows older than the retention window", () => {
    const old = new Date("2026-05-01T00:00:00Z"); // ~43 days
    const recent = new Date("2026-06-10T00:00:00Z"); // 3 days
    expect(isExpired(old, 30, now)).toBe(true);
    expect(isExpired(recent, 30, now)).toBe(false);
  });

  it("deletes an image only when no remaining scene references its hash", () => {
    expect(shouldDeleteImage(0)).toBe(true);
    expect(shouldDeleteImage(2)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `bun run test -- cleanup`
Expected: FAIL — cannot find module `./cleanup`.

- [ ] **Step 3: Implement**

Create `src/lib/cleanup.ts`:
```ts
/** A scene is expired when retention is enabled and it is older than the window. */
export function isExpired(createdAt: Date, retentionDays: number, now: Date): boolean {
  if (retentionDays <= 0) return false;
  const ageMs = now.getTime() - createdAt.getTime();
  return ageMs > retentionDays * 24 * 60 * 60 * 1000;
}

/** An R2 image is safe to delete only when nothing else references its hash. */
export function shouldDeleteImage(remainingRefs: number): boolean {
  return remainingRefs <= 0;
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `bun run test -- cleanup`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cleanup.ts src/lib/cleanup.test.ts
git commit -m "feat(cleanup): pure expiry + orphan-image helpers"
```

### Task 16: Cleanup cron route + R2 delete + schedule

**Files:**
- Modify: `src/lib/r2.ts` (add `deleteObject`)
- Create: `src/app/api/cron/cleanup/route.ts`
- Create/Modify: `vercel.json`

- [ ] **Step 1: Add a delete helper to r2.ts**

In `src/lib/r2.ts`, add the import and helper:
```ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
```
```ts
/** Delete an object by key (used by orphaned-image cleanup). */
export async function deleteObject(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
```

- [ ] **Step 2: Create the cron route**

Create `src/app/api/cron/cleanup/route.ts`:
```ts
import { getDb } from "@/db";
import { scenes } from "@/db/schema";
import { and, eq, lt, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { deleteObject, keyFromUrl } from "@/lib/r2";
import { shouldDeleteImage } from "@/lib/cleanup";

export async function GET(request: Request) {
  // Auth: Vercel Cron sends Authorization: Bearer $CRON_SECRET.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const retentionDays = Number(process.env.SCENE_RETENTION_DAYS || "0");
  if (retentionDays <= 0) {
    return NextResponse.json({ ok: true, disabled: true, deleted: 0 });
  }

  const db = getDb();
  const cutoff = sql`NOW() - (${retentionDays} || ' days')::interval`;
  const expired = await db
    .select({ id: scenes.id, imageHash: scenes.imageHash, imageUrl: scenes.imageUrl })
    .from(scenes)
    .where(lt(scenes.createdAt, cutoff))
    .limit(500);

  let imagesDeleted = 0;
  for (const row of expired) {
    await db.delete(scenes).where(eq(scenes.id, row.id));
    if (row.imageHash && row.imageUrl) {
      const refs = await db
        .select({ id: scenes.id })
        .from(scenes)
        .where(and(eq(scenes.imageHash, row.imageHash), ne(scenes.id, row.id)))
        .limit(1);
      if (shouldDeleteImage(refs.length)) {
        const key = keyFromUrl(row.imageUrl);
        if (key) {
          try { await deleteObject(key); imagesDeleted++; } catch { /* best-effort */ }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, deleted: expired.length, imagesDeleted });
}
```

- [ ] **Step 3: Schedule it (daily) in vercel.json**

If `vercel.json` exists, add the `crons` array; otherwise create `vercel.json`:
```json
{
  "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 4 * * *" }]
}
```

- [ ] **Step 4: Verify build + lint**

Run: `bun run lint 2>&1 | tail -8 && echo "===BUILD===" && bun run build 2>&1 | tail -6`
Expected: clean; `/api/cron/cleanup` appears in the route list.

- [ ] **Step 5: Manual verification**

With the dev server running and `CRON_SECRET=test` in `.env` (and `SCENE_RETENTION_DAYS` unset):
```bash
curl -s -H "Authorization: Bearer test" http://localhost:3000/api/cron/cleanup
```
Expected: `{"ok":true,"disabled":true,"deleted":0}`. Without the header → `401`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/r2.ts src/app/api/cron/cleanup/route.ts vercel.json
git commit -m "feat(cleanup): optional TTL cron with orphaned-image GC (default off)"
```

---

## Phase 7 — Docs + wrap-up

### Task 17: Update IDEAS.md

**Files:**
- Modify: `IDEAS.md`

- [ ] **Step 1: Tick shipped items + annotate**

In `IDEAS.md`:
- Line ~29 "Scene expiration (30-day TTL…)": change `[ ]` → `[-]` and annotate `(mechanism shipped, default-disabled via SCENE_RETENTION_DAYS; per-user permanence pending auth)`.
- Under "Sharing & Backend", add `[x] Read-only viewer page + chrome-less /embed/[id] (iframe player)`, `[x] OG/Twitter social preview images`, `[x] CORS + immutable caching on scene reads`.
- Under a fixes note, add `[x] Fixed: shared scenes now restore their mask`.
- For the CDN-player line (~45), append `(groundwork: /embed/[id] + CORS + scene-by-id read are now in place)`.

- [ ] **Step 2: Commit**

```bash
git add IDEAS.md
git commit -m "docs: record sharing-system polish in IDEAS.md"
```

### Task 18: Full verification gate

- [ ] **Step 1: Run the whole suite + build**

Run:
```bash
bun run lint 2>&1 | tail -8 && echo "===UNIT===" && bun run test 2>&1 | tail -6 && echo "===BROWSER===" && bun run test:browser 2>&1 | tail -8 && echo "===BUILD===" && bun run build 2>&1 | tail -6
```
Expected: lint clean (pre-existing warnings only), all unit + browser tests pass, build succeeds.

- [ ] **Step 2: Decide integration**

Use `superpowers:finishing-a-development-branch` to merge `feat/sharing-polish` → `main` (or open a PR), per preference.

---

## Self-Review

**Spec coverage** (against the 9 findings from the assessment):
1. CORS — Tasks 3–5. ✅
2. Read caching — Task 4. ✅
3. Standalone viewer — Tasks 10–12. ✅
4. Mask-loss bug — Tasks 1–2. ✅
5. OG previews — Tasks 6–9, 11. ✅
6. Imageless sharing — Task 13. ✅
7. Double DB hit — eliminated in Task 11 (single `loadRow`, no redirect/re-fetch). ✅
8. TTL/cleanup — Tasks 15–16 (default-disabled). ✅
9. ID hygiene — Task 14 (collision retry) + Task 2 (modernized base64 decode). ✅

**Type consistency:** `UploadResult` reused (Task 7); `buildSceneMetadata`/`hydrateSceneImage` defined in Task 9 and consumed in Tasks 11–12; `SceneViewer` props (`html`, `id`, `chrome`) consistent across Tasks 10–12; `fromBase64Auto` defined Task 1, used Task 2; `shouldDeleteImage`/`isExpired` defined Task 15, used Task 16; `ogImageUrl` column (Task 6) → POST store (Task 8) → metadata read (Tasks 9, 11).

**Placeholder scan:** no TBD/"handle errors"/"similar to" — every code step shows full code.

**Known constraints flagged:** R2 CORS + DB migration scripts (Tasks 5, 6) may need real R2/DATABASE_URL creds to *run*; both are idempotent and the plan says to defer running if creds are absent here. Browser-test mount approach (Task 10) has a documented fallback to the repo's existing `*.browser.test.ts` pattern.
