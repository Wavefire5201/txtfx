# txtfx

Turn any image into animated ASCII art. Drop an image, convert it to ASCII, layer effects on top, and export, share, or embed the result.

<!-- ![demo](docs/demo.gif) -->

## Features

- **Image to ASCII** — adjustable font size, line height, letter spacing, character ramp, gamma, and blend modes
- **Mask painting** — brush foreground/background regions to control where effects appear
- **Timeline** — schedule effects across a timeline, loop playback, scrub and preview
- **12 built-in effects** — twinkle, meteor, rain, snow, fire, matrix, scanline, glitch, typewriter, decode, firework, custom emitter
- **Deterministic & seeded** — a scene seed drives all effect randomness, so previews scrub stably, loops are seamless, and exports are byte-reproducible (reroll the seed for a fresh variant)
- **Export** — PNG still, GIF, MP4/WebM video, transparent WebM (VP8/VP9 alpha), animated APNG, standalone HTML, and inline embed snippet
- **Share** — short links (`/s/<id>`) backed by a database + image CDN, with a read-only viewer and social/OG previews
- **Embed** — drop-in `<txtfx-scene scene-id="…">` web component (sandboxed iframe; pauses off-screen, respects reduced-motion)

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Zustand · WebGL2 renderer with a Canvas2D fallback (shared by editor, player, and export). Sharing uses Neon Postgres + Cloudflare R2; export uses mediabunny (WebCodecs) and gifenc in a Web Worker.

## Dev

```bash
bun install
bun dev
```

Open [localhost:3000](http://localhost:3000). (`predev` builds the player + embed bundles automatically.)

## Build

```bash
bun run build
```

Runs `build:player` and `build:embed` (generated bundles), then `next build`.

## Test

```bash
bun run test          # unit tests (node)
bun run test:browser  # golden/pixel + behavior tests in real Chromium (vitest browser)
bun run test:all      # both
```

Do **not** run bare `bun test` — it invokes bun's own runner, which lacks the vitest APIs. Pixel goldens live in `src/test/goldens/` and are machine-specific (skipped in CI, enforced locally); regenerate intentional changes with `UPDATE_GOLDENS=1 bun run test:browser`.

CI (GitHub Actions) runs lint + unit + browser + build on every PR.

## Sharing / embed setup (optional)

Short links, OG previews, and the `<txtfx-scene>` embed need a database and image bucket:

- `DATABASE_URL` — Neon Postgres (schema in `src/db/schema.ts`; push with `bunx drizzle-kit push`)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `NEXT_PUBLIC_R2_PUBLIC_URL` — Cloudflare R2

Apply a GET CORS policy to the bucket so cross-origin embeds can read image pixels — via the Cloudflare dashboard (R2 → bucket → Settings → CORS Policy) or `wrangler r2 bucket cors set <bucket> --file cors.json`:

```json
[{ "AllowedOrigins": ["*"], "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"], "ExposeHeaders": ["Content-Length", "Content-Type"], "MaxAgeSeconds": 86400 }]
```
