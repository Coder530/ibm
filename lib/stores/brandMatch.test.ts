import { describe, expect, it } from "vitest";
import { matchRetailer } from "./brandMatch";

describe("matchRetailer", () => {
  it("matches common brand/name variants", () => {
    expect(matchRetailer({ name: "Sainsbury's Local" })).toBe("sainsburys");
    expect(matchRetailer({ name: "Tesco Express" })).toBe("tesco");
    expect(matchRetailer({ brand: "Marks & Spencer" })).toBe("mands");
    expect(matchRetailer({ name: "M&S Simply Food" })).toBe("mands");
    expect(matchRetailer({ name: "Co-op" })).toBe("coop");
    expect(matchRetailer({ name: "The Co-operative Food" })).toBe("coop");
    expect(matchRetailer({ brand: "Asda" })).toBe("asda");
    expect(matchRetailer({ brand: "Morrisons" })).toBe("morrisons");
    expect(matchRetailer({ brand: "Aldi" })).toBe("aldi");
    expect(matchRetailer({ brand: "Lidl" })).toBe("lidl");
    expect(matchRetailer({ brand: "Waitrose" })).toBe("waitrose");
    expect(matchRetailer({ brand: "Iceland" })).toBe("iceland");
  });

  it("uses operator as a fallback signal", () => {
    expect(matchRetailer({ operator: "Tesco Stores Ltd" })).toBe("tesco");
  });

  it("returns null for unknown or empty tags", () => {
    expect(matchRetailer({ name: "Joe's Corner Shop" })).toBeNull();
    expect(matchRetailer({})).toBeNull();
  });

  it("never matches Ocado, which has no physical stores", () => {
    expect(matchRetailer({ brand: "Ocado", name: "Ocado" })).toBeNull();
  });
});
