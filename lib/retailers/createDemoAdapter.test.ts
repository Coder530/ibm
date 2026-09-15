import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ShoppingItem } from "@/types/shopping";
import type { CatalogProduct, MatchResult } from "@/lib/products/matcher";

const matchItemMock = vi.fn<(...args: unknown[]) => MatchResult | null>();

vi.mock("@/lib/products/matcher", () => ({
  matchItem: (...args: unknown[]) => matchItemMock(...args),
}));

const CANDIDATE: CatalogProduct = {
  productKey: "milk-semi",
  productId: "tesco:milk-semi",
  productName: "Tesco Semi-Skimmed Milk",
  brand: null,
  isOwnBrand: true,
  size: "4 pints",
  priceMinor: 145,
  available: true,
  qualifiers: ["semi-skimmed"],
};

vi.mock("@/lib/pricing/demoCatalog", () => ({
  DEMO_SOURCE: "demo-catalog",
  getCatalogProducts: () => [CANDIDATE],
  isDemoData: () => true as const,
}));

function item(overrides: Partial<ShoppingItem> = {}): ShoppingItem {
  return { id: "i1", name: "milk", quantity: 1, ...overrides };
}

describe("createDemoAdapter", () => {
  beforeEach(() => {
    matchItemMock.mockReset();
  });

  it("builds a demo offer with freshness/source and applies the quantity multiplier to price", async () => {
    matchItemMock.mockReturnValueOnce({
      product: CANDIDATE,
      confidence: 0.9,
      quantityMultiplier: 2,
    });

    const { createDemoAdapter } = await import("./createDemoAdapter");
    const adapter = createDemoAdapter("tesco");
    const offers = await adapter.findOffers([item()], { mode: "cheapest" });
    const offer = offers.get("i1");

    expect(offer).not.toBeNull();
    expect(offer?.freshness).toBe("demo");
    expect(offer?.source).toBe("demo-catalog");
    expect(offer?.priceMinor).toBe(290); // 145 * 2
    expect(offer?.availability).toBe("available");
    expect(offer?.retailerId).toBe("tesco");
    expect(offer?.quantityEstimated).toBeUndefined();
  });

  it("R3-4: carries the matcher's estimated-quantity flag onto the offer", async () => {
    matchItemMock.mockReturnValueOnce({
      product: { ...CANDIDATE, productKey: "bananas", size: "1kg", priceMinor: 74 },
      confidence: 0.65,
      quantityMultiplier: 2,
      quantityEstimated: true,
    });

    const { createDemoAdapter } = await import("./createDemoAdapter");
    const adapter = createDemoAdapter("tesco");
    const offers = await adapter.findOffers([item({ id: "i3", name: "bananas", size: "12 pack" })], {
      mode: "cheapest",
    });
    const offer = offers.get("i3");

    expect(offer?.quantityEstimated).toBe(true);
    expect(offer?.priceMinor).toBe(148);
    expect(offer?.size).toBe("2 × 1kg");
  });

  it("returns null for an unmatched item without dropping the map entry", async () => {
    matchItemMock.mockReturnValueOnce(null);

    const { createDemoAdapter } = await import("./createDemoAdapter");
    const adapter = createDemoAdapter("tesco");
    const offers = await adapter.findOffers([item({ id: "i2", name: "nonsense-item" })], {
      mode: "cheapest",
    });

    expect(offers.has("i2")).toBe(true);
    expect(offers.get("i2")).toBeNull();
  });
});
