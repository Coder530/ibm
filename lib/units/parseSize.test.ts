import { describe, expect, it } from "vitest";
import { parseSize } from "./parseSize";

describe("parseSize", () => {
  it("parses simple mass values", () => {
    expect(parseSize("500g")).toEqual({ kind: "mass", grams: 500 });
    expect(parseSize("1.5kg")).toEqual({ kind: "mass", grams: 1500 });
  });

  it("parses simple volume values", () => {
    expect(parseSize("1l")).toEqual({ kind: "volume", ml: 1000 });
    expect(parseSize("330ml")).toEqual({ kind: "volume", ml: 330 });
  });

  it("parses UK pints", () => {
    expect(parseSize("2 pints")).toEqual({ kind: "volume", ml: 1136 });
    expect(parseSize("4pt")).toEqual({ kind: "volume", ml: 2272 });
  });

  it("parses pack counts", () => {
    expect(parseSize("6 pack")).toEqual({ kind: "count", count: 6 });
    expect(parseSize("x12")).toEqual({ kind: "count", count: 12 });
  });

  it("parses dozen", () => {
    expect(parseSize("dozen")).toEqual({ kind: "count", count: 12 });
  });

  it("parses compound multipacks", () => {
    expect(parseSize("4 x 400g")).toEqual({ kind: "mass", grams: 1600 });
  });

  it("returns null for unrecognised text", () => {
    expect(parseSize("bananas")).toBeNull();
    expect(parseSize("")).toBeNull();
    expect(parseSize("   ")).toBeNull();
  });
});
