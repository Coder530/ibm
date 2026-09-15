import { describe, expect, it } from "vitest";
import { unitPriceMinor } from "./unitPrice";

describe("unitPriceMinor", () => {
  it("computes price per litre for volume, rounding half-up", () => {
    expect(unitPriceMinor(145, { kind: "volume", ml: 2272 })).toEqual({
      unitPriceMinor: 64,
      unit: "l",
    });
  });

  it("computes price per kg for mass >= 1kg", () => {
    expect(unitPriceMinor(500, { kind: "mass", grams: 2000 })).toEqual({
      unitPriceMinor: 250,
      unit: "kg",
    });
  });

  it("computes price per kg for mass < 1kg too (one basis for every mass pack)", () => {
    expect(unitPriceMinor(230, { kind: "mass", grams: 250 })).toEqual({
      unitPriceMinor: 920,
      unit: "kg",
    });
    expect(unitPriceMinor(120, { kind: "mass", grams: 500 })).toEqual({
      unitPriceMinor: 240,
      unit: "kg",
    });
    // Half-up to the integer penny: 99p / 300g = 330p/kg exactly; 100p / 300g = 333.33 → 333.
    expect(unitPriceMinor(100, { kind: "mass", grams: 300 }).unitPriceMinor).toBe(333);
    expect(unitPriceMinor(101, { kind: "mass", grams: 200 }).unitPriceMinor).toBe(505);
  });

  it("computes price per litre for small volumes too", () => {
    expect(unitPriceMinor(85, { kind: "volume", ml: 250 })).toEqual({ unitPriceMinor: 340, unit: "l" });
  });

  it("computes price per item for count", () => {
    expect(unitPriceMinor(240, { kind: "count", count: 6 })).toEqual({
      unitPriceMinor: 40,
      unit: "item",
    });
  });

  it("throws for non-positive measures", () => {
    expect(() => unitPriceMinor(100, { kind: "mass", grams: 0 })).toThrow();
    expect(() => unitPriceMinor(100, { kind: "volume", ml: -1 })).toThrow();
    expect(() => unitPriceMinor(100, { kind: "count", count: 0 })).toThrow();
  });
});
