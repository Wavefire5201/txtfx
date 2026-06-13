/**
 * Builds the <txtfx-scene> custom element into a minified IIFE served at
 * /v1/txtfx-scene.js. Third-party pages load this tiny script; it upgrades
 * <txtfx-scene scene-id="..."> into a sandboxed iframe pointing at /embed/{id}.
 */
import { buildSync } from "esbuild";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const root = join(import.meta.dir, "..");

const result = buildSync({
  entryPoints: [join(root, "src/player/txtfx-scene.ts")],
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2020",
  write: false,
});

const js = result.outputFiles[0].text;
const outDir = join(root, "public/v1");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "txtfx-scene.js"), js);

console.log(`txtfx-scene.js written (${js.length} bytes of JS)`);
