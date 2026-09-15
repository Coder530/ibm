import { describe, expect, it } from "vitest";
import { RETAILER_IDS } from "@/types/retailers";
import catalogJson from "@/data/retailers/demo-catalog.json";
import { DEMO_SOURCE, getCatalogProducts, isDemoData } from "./demoCatalog";

// Frozen key list from the spec — must match Builder B's CANONICAL_PRODUCTS keys.
const REQUIRED_KEYS = [
  "milk-semi", "milk-whole", "milk-skimmed", "milk-oat", "milk-soya", "butter", "spread",
  "cheddar", "mozzarella", "yoghurt-greek", "yoghurt-natural", "eggs", "cream-double",
  "bread-white", "bread-wholemeal", "bagels", "wraps", "croissants", "bananas", "apples",
  "oranges", "grapes", "strawberries", "lemons", "avocados", "tomatoes", "cucumber",
  "lettuce", "onions", "garlic", "potatoes", "carrots", "broccoli", "peppers", "mushrooms",
  "spinach", "chicken-breast", "beef-mince", "pork-sausages", "bacon", "salmon-fillets",
  "tuna-tin", "ham", "pasta-dried", "spaghetti", "rice-basmati", "oats", "cornflakes",
  "baked-beans", "chopped-tomatoes", "pasta-sauce", "flour-plain", "sugar", "olive-oil",
  "vegetable-oil", "coffee-instant", "tea-bags", "orange-juice", "toilet-roll",
  "washing-up-liquid", "frozen-peas", "chips-frozen", "pizza-frozen", "ice-cream", "crisps",
  "chocolate", "biscuits", "water-still", "cola",
];

interface RawCatalog {
  _notice: string;
  products: Record<string, Record<string, { priceMinor: number } | null>>;
}

const raw = catalogJson as unknown as RawCatalog;

describe("demo-catalog.json", () => {
  it("carries a DEMO notice", () => {
    expect(raw._notice).toContain("DEMO");
  });

  it("has every required product key", () => {
    for (const key of REQUIRED_KEYS) {
      expect(raw.products).toHaveProperty(key);
    }
  });

  it("has an integer priceMinor > 0 for every present retailer entry", () => {
    for (const byRetailer of Object.values(raw.products)) {
      for (const entry of Object.values(byRetailer)) {
        if (entry === null) continue;
        expect(Number.isInteger(entry.priceMinor)).toBe(true);
        expect(entry.priceMinor).toBeGreaterThan(0);
      }
    }
  });
});

describe("demoCatalog loader", () => {
  it("isDemoData is always true", () => {
    expect(isDemoData()).toBe(true);
  });

  it("DEMO_SOURCE is the fixed demo-catalog label", () => {
    expect(DEMO_SOURCE).toBe("demo-catalog");
  });

  it("getCatalogProducts builds productId as `${retailerId}:${productKey}` for every retailer", () => {
    for (const retailerId of RETAILER_IDS) {
      const products = getCatalogProducts(retailerId);
      expect(products.length).toBeGreaterThan(0);
      for (const product of products) {
        expect(product.productId).toBe(`${retailerId}:${product.productKey}`);
      }
    }
  });

  it("includes out-of-stock products with available: false, not dropped", () => {
    const anyOutOfStock = RETAILER_IDS.some((id) =>
      getCatalogProducts(id).some((p) => p.available === false)
    );
    expect(anyOutOfStock).toBe(true);
  });
});
