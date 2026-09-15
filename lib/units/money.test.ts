import { describe, expect, it } from "vitest";
import { assertMinor, formatMinor, mulMinor, sumMinor } from "./money";

describe("assertMinor", () => {
  it("returns the value when it is a safe integer", () => {
    expect(assertMinor(145)).toBe(145);
    expect(assertMinor(0)).toBe(0);
    expect(assertMinor(-50)).toBe(-50);
  });

  it("throws for non-integer values", () => {
    expect(() => assertMinor(1.5)).toThrow();
    expect(() => assertMinor(Number.NaN)).toThrow();
    expect(() => assertMinor(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("sumMinor", () => {
  it("sums an array of integer pence values", () => {
    expect(sumMinor([100, 250, 5])).toBe(355);
    expect(sumMinor([])).toBe(0);
  });

  it("throws if any value is not a safe integer", () => {
    expect(() => sumMinor([100, 1.5])).toThrow();
  });
});

describe("mulMinor", () => {
  it("multiplies pence by a positive integer quantity", () => {
    expect(mulMinor(145, 3)).toBe(435);
  });

  it("throws when quantity is not a positive integer", () => {
    expect(() => mulMinor(145, 0)).toThrow();
    expect(() => mulMinor(145, -1)).toThrow();
    expect(() => mulMinor(145, 1.5)).toThrow();
  });
});

describe("formatMinor", () => {
  it("formats pence as pounds with two decimal places", () => {
    expect(formatMinor(145)).toBe("£1.45");
    expect(formatMinor(75)).toBe("£0.75");
    expect(formatMinor(0)).toBe("£0.00");
    expect(formatMinor(100)).toBe("£1.00");
  });

  it("formats negative values with a leading minus sign", () => {
    expect(formatMinor(-145)).toBe("−£1.45");
  });

  it("throws for non-integer pence", () => {
    expect(() => formatMinor(1.5)).toThrow();
  });
});
