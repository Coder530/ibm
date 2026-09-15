import { describe, expect, it } from "vitest";
import { normalisePostcode } from "./postcode";

describe("normalisePostcode", () => {
  it("normalises valid postcodes to uppercase with a single space", () => {
    expect(normalisePostcode(" sw1a1aa ")).toBe("SW1A 1AA");
    expect(normalisePostcode("EC1A 1BB")).toBe("EC1A 1BB");
    expect(normalisePostcode("gir0aa")).toBe("GIR 0AA");
  });

  it("returns null for invalid postcodes", () => {
    expect(normalisePostcode("hello")).toBeNull();
    expect(normalisePostcode("")).toBeNull();
    expect(normalisePostcode("12345")).toBeNull();
  });
});
