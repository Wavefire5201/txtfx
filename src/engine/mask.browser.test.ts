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
