import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Toolbar export menu", () => {
  it("exposes every GIF preset in the export menu", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/editor/Toolbar.tsx"), "utf8");

    expect(source).toContain('handleExportGif("preview")');
    expect(source).toContain('handleExportGif("balanced")');
    expect(source).toContain('handleExportGif("quality")');
    expect(source).toContain("GIF Quality");
  });
});
