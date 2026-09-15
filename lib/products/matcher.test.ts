import { describe, expect, it } from "vitest";
import type { ShoppingItem } from "@/types/shopping";
import { matchItem, type CatalogProduct } from "./matcher";
import {
  AMBIGUOUS_NAMES,
  APPROX_ITEM_GRAMS,
  CANONICAL_PRODUCTS,
  COUNTABLE_KEYS,
  MATERIAL_QUALIFIERS,
  canonicalise,
  stemToken,
  tokenize,
} from "./synonyms";

function product(overrides: Partial<CatalogProduct> & Pick<CatalogProduct, "productKey">): CatalogProduct {
  return {
    productId: `tesco:${overrides.productKey}`,
    productName: overrides.productKey,
    brand: null,
    isOwnBrand: true,
    size: "",
    priceMinor: 100,
    available: true,
    qualifiers: [],
    ...overrides,
  };
}

function item(name: string, extra: Partial<ShoppingItem> = {}): ShoppingItem {
  return { id: "item-0", name, quantity: 1, ...extra };
}

const cheapest = { mode: "cheapest" } as const;

const semiMilk = product({
  productKey: "milk-semi",
  productId: "tesco:milk-semi",
  productName: "Semi Skimmed Milk 2 Pints",
  size: "2 pints",
  priceMinor: 125,
  qualifiers: ["semi-skimmed"],
});
const oatMilk = product({
  productKey: "milk-oat",
  productId: "tesco:milk-oat",
  productName: "Oat Drink 1L",
  size: "1l",
  priceMinor: 90,
  qualifiers: ["oat"],
});

describe("synonyms", () => {
  const REQUIRED_KEYS = [
    "milk-semi", "milk-whole", "milk-skimmed", "milk-oat", "milk-soya", "butter", "spread", "cheddar", "mozzarella",
    "yoghurt-greek", "yoghurt-natural", "eggs", "cream-double", "bread-white", "bread-wholemeal", "bagels", "wraps",
    "croissants", "bananas", "apples", "oranges", "grapes", "strawberries", "lemons", "avocados", "tomatoes",
    "cucumber", "lettuce", "onions", "garlic", "potatoes", "carrots", "broccoli", "peppers", "mushrooms", "spinach",
    "chicken-breast", "beef-mince", "pork-sausages", "bacon", "salmon-fillets", "tuna-tin", "ham", "pasta-dried",
    "spaghetti", "rice-basmati", "oats", "cornflakes", "baked-beans", "chopped-tomatoes", "pasta-sauce",
    "flour-plain", "sugar", "olive-oil", "vegetable-oil", "coffee-instant", "tea-bags", "orange-juice",
    "toilet-roll", "washing-up-liquid", "frozen-peas", "chips-frozen", "pizza-frozen", "ice-cream", "crisps",
    "chocolate", "biscuits", "water-still", "cola",
  ];

  it("includes every frozen key, at least 90 entries, no duplicate keys or names", () => {
    const keys = CANONICAL_PRODUCTS.map((p) => p.key);
    expect(CANONICAL_PRODUCTS.length).toBeGreaterThanOrEqual(90);
    for (const k of REQUIRED_KEYS) expect(keys).toContain(k);
    expect(new Set(keys).size).toBe(keys.length);
    const names = CANONICAL_PRODUCTS.flatMap((p) => p.names.map((n) => tokenize(n).map(stemToken).join(" ")));
    expect(new Set(names).size).toBe(names.length);
  });

  it("intrinsic qualifiers are all material qualifiers", () => {
    for (const p of CANONICAL_PRODUCTS) {
      for (const q of p.qualifiers ?? []) expect(MATERIAL_QUALIFIERS).toContain(q);
    }
  });

  it.each([
    ["semi skimmed", "milk-semi"],
    ["semi-skimmed milk", "milk-semi"],
    ["milk", "milk-semi"],
    ["Whole Milk", "milk-whole"],
    ["full fat milk", "milk-whole"],
    ["oat milk", "milk-oat"],
    ["mince", "beef-mince"],
    ["loo roll", "toilet-roll"],
    ["spuds", "potatoes"],
    ["coke", "cola"],
    ["porridge oats", "oats"],
    ["tomato pasta sauce", "pasta-sauce"],
    ["Sainsbury's large free range eggs", "eggs"],
    ["sugar free cola", "cola"],
  ])("canonicalise(%s) → %s", (name, key) => {
    expect(canonicalise(name).key).toBe(key);
  });

  it("extracts material qualifiers", () => {
    expect(canonicalise("diet coke").qualifiers).toEqual(["diet"]);
    // F-10: 'free range' is explained (not an unknown word) but is not material.
    expect(canonicalise("organic free-range eggs")).toMatchObject({ key: "eggs", qualifiers: ["organic"] });
    expect(canonicalise("unsmoked bacon")).toMatchObject({ key: "bacon", qualifiers: ["unsmoked"] });
    expect(canonicalise("smoked bacon")).toMatchObject({ key: "bacon", qualifiers: [] });
    expect(MATERIAL_QUALIFIERS).not.toContain("free-range");
    expect(MATERIAL_QUALIFIERS).toContain("unsmoked");
    expect(MATERIAL_QUALIFIERS).not.toContain("smoked");
  });

  it("countable keys cover the spec minimum and are all canonical keys", () => {
    const keys = new Set(CANONICAL_PRODUCTS.map((p) => p.key));
    for (const k of [
      "eggs", "bananas", "apples", "oranges", "lemons", "avocados", "onions", "peppers",
      "croissants", "bagels", "wraps", "cucumber", "lettuce", "toilet-roll", "tea-bags",
    ]) {
      expect(COUNTABLE_KEYS.has(k)).toBe(true);
    }
    for (const k of COUNTABLE_KEYS) expect(keys.has(k)).toBe(true);
  });

  it("M5: every produce item with a typical weight is bought by count", () => {
    for (const k of APPROX_ITEM_GRAMS.keys()) expect(COUNTABLE_KEYS.has(k), k).toBe(true);
  });

  it("returns a null key when a word is unexplained", () => {
    expect(canonicalise("strawberry yoghurt")).toEqual({ key: null, category: null, qualifiers: [] });
    expect(canonicalise("goats cheese").key).toBeNull();
    expect(canonicalise("black pepper").key).toBe("black-pepper");
    expect(canonicalise("").key).toBeNull();
  });
});

describe("matchItem", () => {
  it('"oat milk" never matches plain milk', () => {
    expect(matchItem(item("oat milk"), [semiMilk], cheapest)).toBeNull();
    // A milk-oat product whose catalog entry omits its intrinsic 'oat' qualifier still matches; semi milk never does.
    expect(matchItem(item("oat milk"), [product({ productKey: "milk-oat", qualifiers: [] }), semiMilk], cheapest)?.product.productKey).toBe("milk-oat");
  });

  it('"milk" never matches oat milk', () => {
    expect(matchItem(item("milk"), [oatMilk], cheapest)).toBeNull();
    const mislabelled = product({ productKey: "milk-semi", productId: "x:oat", qualifiers: ["oat"] });
    expect(matchItem(item("milk"), [mislabelled], cheapest)).toBeNull();
  });

  it("never matches across extra material qualifiers in either direction", () => {
    const eggs = product({ productKey: "eggs", size: "6 pack" });
    const organic = product({ productKey: "eggs", productId: "t:org", size: "6 pack", qualifiers: ["Organic"] });
    expect(matchItem(item("organic eggs"), [eggs], cheapest)).toBeNull();
    expect(matchItem(item("eggs"), [organic], cheapest)).toBeNull();
    expect(matchItem(item("organic eggs"), [eggs, organic], cheapest)?.product.productId).toBe("t:org");
  });

  it("F-10: 'free range' is not material; 'unsmoked' is (but 'smoked' is not)", () => {
    const eggs = product({ productKey: "eggs", size: "6 pack" });
    const freeRange = product({ productKey: "eggs", productId: "t:fr", size: "6 pack", qualifiers: ["Free Range"] });
    expect(matchItem(item("free range eggs"), [eggs], cheapest)?.product.productId).toBe(eggs.productId);
    expect(matchItem(item("eggs"), [freeRange], cheapest)?.product.productId).toBe("t:fr");

    const smoked = product({ productKey: "bacon", productName: "Richmond Smoked Bacon Rashers", size: "300g" });
    expect(matchItem(item("unsmoked bacon"), [smoked], cheapest)).toBeNull();
    expect(matchItem(item("smoked bacon"), [smoked], cheapest)?.product.productId).toBe(smoked.productId);
    expect(matchItem(item("bacon"), [smoked], cheapest)?.product.productId).toBe(smoked.productId);
    const unsmoked = product({ productKey: "bacon", productId: "t:unsmoked", size: "300g", qualifiers: ["unsmoked"] });
    expect(matchItem(item("unsmoked bacon"), [smoked, unsmoked], cheapest)?.product.productId).toBe("t:unsmoked");
  });

  it("F-1: count item vs count pack uses a normal multiplier", () => {
    const sixEggs = product({ productKey: "eggs", size: "6 pack", priceMinor: 224 });
    expect(matchItem(item("eggs", { size: "3 pack" }), [sixEggs], cheapest)).toMatchObject({ quantityMultiplier: 1 });
    expect(matchItem(item("eggs", { size: "8 pack" }), [sixEggs], cheapest)).toMatchObject({ quantityMultiplier: 2 });
    expect(matchItem(item("eggs", { size: "6 pack" }), [sixEggs], cheapest)).toMatchObject({ quantityMultiplier: 1, confidence: 1 });
  });

  it("F-1: count item vs a mass product with a typical weight → estimated packs, flagged (0.65)", () => {
    const bag = product({ productKey: "bananas", size: "1kg", priceMinor: 74 });
    const result = matchItem(item("bananas", { size: "6 pack" }), [bag], cheapest);
    expect(result).toMatchObject({ quantityMultiplier: 1, confidence: 0.65, quantityEstimated: true });
    expect(result?.confidence).toBeLessThan(0.7);
  });

  it("R3-4: a count of a weight-sold product buys enough packs for the typical weight", () => {
    const bag = product({ productKey: "bananas", size: "1kg", priceMinor: 74 });
    // 12 × 120g = 1.44kg → 2 bags.
    expect(matchItem(item("bananas", { size: "12 pack" }), [bag], cheapest)).toMatchObject({
      quantityMultiplier: 2,
      confidence: 0.65,
      quantityEstimated: true,
    });
    // 99 × 120g = 11.88kg → 12 bags (the cap, still allowed).
    expect(matchItem(item("bananas", { size: "99 pack" }), [bag], cheapest)).toMatchObject({
      quantityMultiplier: 12,
      quantityEstimated: true,
    });
    // 20 × 200g = 4kg against a 2.5kg bag → 2 bags.
    const potatoes = product({ productKey: "potatoes", size: "2.5kg" });
    expect(matchItem(item("potatoes", { size: "20 pack" }), [potatoes], cheapest)).toMatchObject({
      quantityMultiplier: 2,
      quantityEstimated: true,
    });
  });

  it("R3-4: more than 12 estimated packs, or no known item weight, excludes the candidate", () => {
    const bag = product({ productKey: "bananas", size: "1kg", priceMinor: 74 });
    // 500 × 120g = 60kg → 60 bags > 12.
    expect(matchItem(item("bananas", { size: "500 pack" }), [bag], cheapest)).toBeNull();
    // Cucumbers have no typical weight: never a silent single pack.
    const cucumberByWeight = product({ productKey: "cucumber", size: "500g" });
    expect(matchItem(item("cucumber", { size: "2 pack" }), [cucumberByWeight], cheapest)).toBeNull();
    // Volume products are never estimated from a count.
    const byVolume = product({ productKey: "bananas", size: "1l" });
    expect(matchItem(item("bananas", { size: "6 pack" }), [byVolume], cheapest)).toBeNull();
  });

  it("R3-4: count-for-count matches are not flagged as estimated", () => {
    const sixEggs = product({ productKey: "eggs", size: "6 pack", priceMinor: 224 });
    const result = matchItem(item("eggs", { size: "12 pack" }), [sixEggs], cheapest);
    expect(result).toMatchObject({ quantityMultiplier: 2 });
    expect(result?.quantityEstimated).toBeUndefined();
  });

  it("R3-8: the head noun is the last word before a connector ('with', 'in', ...)", () => {
    const oj = product({
      productKey: "orange-juice",
      productName: "Tropicana Orange Juice",
      brand: "Tropicana",
      size: "1l",
    });
    expect(matchItem(item("orange juice with bits"), [oj], cheapest)?.product.productId).toBe(oj.productId);
    // "cake with chocolate chips" is cake, not chocolate chips.
    const chips = product({ productKey: "chocolate-chips", productName: "Chocolate Chips", size: "100g" });
    expect(matchItem(item("cake with chocolate chips"), [chips], cheapest)).toBeNull();
  });

  it("F-3: token fallback rejects a different head noun ('chocolate milk' ≠ chocolate bar)", () => {
    const bar = product({ productKey: "chocolate", productName: "Cadbury Chocolate Bar", brand: "Cadbury", size: "200g" });
    expect(matchItem(item("chocolate milk"), [bar], cheapest)).toBeNull();
  });

  it("F-3: percent tokens are material on both the token and canonical paths", () => {
    const mince = product({ productKey: "beef-mince", productName: "Tesco Beef Mince 5% Fat", size: "500g" });
    expect(matchItem(item("20% fat beef mince"), [mince], cheapest)).toBeNull();
    expect(matchItem(item("beef mince 20% fat"), [mince], cheapest)).toBeNull();
    expect(matchItem(item("beef mince 20%"), [mince], cheapest)).toBeNull();
    expect(matchItem(item("beef mince 5% fat"), [mince], cheapest)?.product.productId).toBe(mince.productId);
    expect(matchItem(item("beef mince"), [mince], cheapest)?.product.productId).toBe(mince.productId);
  });

  it("L4: '100%' is noise and '2%' is ignored for semi-skimmed milk; other percentages stay material", () => {
    const oj = product({ productKey: "orange-juice", productName: "Tesco Orange Juice", size: "1l" });
    expect(matchItem(item("100% orange juice"), [oj], cheapest)?.product.productId).toBe(oj.productId);
    expect(matchItem(item("orange juice 100%"), [oj], cheapest)?.product.productId).toBe(oj.productId);
    expect(matchItem(item("2% milk"), [semiMilk], cheapest)?.product.productId).toBe(semiMilk.productId);
    const mince = product({ productKey: "beef-mince", productName: "Tesco Beef Mince", size: "500g" });
    expect(matchItem(item("beef mince 20%"), [mince], cheapest)).toBeNull();
    const yoghurt = product({ productKey: "yoghurt-greek", productName: "Greek Yoghurt", size: "500g" });
    expect(matchItem(item("greek yoghurt 2%"), [yoghurt], cheapest)).toBeNull();
  });

  it("F-4: bare 'pepper' is ambiguous → null; explicit pepper names still match", () => {
    const peppers = product({ productKey: "peppers", productName: "Tesco Mixed Peppers", size: "3 pack" });
    const blackPepper = product({ productKey: "black-pepper", productName: "Black Pepper", size: "100g" });
    expect(AMBIGUOUS_NAMES).toContain("pepper");
    expect(matchItem(item("pepper"), [peppers, blackPepper], cheapest)).toBeNull();
    expect(matchItem(item("Pepper"), [peppers, blackPepper], cheapest)).toBeNull();
    for (const name of ["peppers", "bell pepper", "bell peppers", "red pepper", "green peppers", "yellow pepper"]) {
      expect(matchItem(item(name), [peppers, blackPepper], cheapest)?.product.productKey).toBe("peppers");
    }
    expect(matchItem(item("black pepper"), [peppers, blackPepper], cheapest)?.product.productKey).toBe("black-pepper");
  });

  it("F-7: candidates needing more than 12 packs are excluded, never under-supplied", () => {
    const six = product({ productKey: "eggs", productId: "r:six", size: "6 pack", priceMinor: 150 });
    const dozen = product({ productKey: "eggs", productId: "r:dozen", size: "12 pack", priceMinor: 250 });
    const result = matchItem(item("eggs", { size: "120 pack" }), [six, dozen], cheapest);
    expect(result).toMatchObject({ product: { productId: "r:dozen" }, quantityMultiplier: 10 });
    expect(matchItem(item("eggs", { size: "120 pack" }), [six], cheapest)).toBeNull();
  });

  it("ignores non-material candidate qualifiers ('salted', 'block') when matching 'butter'", () => {
    const butter = product({
      productKey: "butter",
      productName: "Salted Block Butter 250g",
      size: "250g",
      qualifiers: ["salted", "block"],
    });
    expect(matchItem(item("butter"), [butter], cheapest)?.product.productId).toBe(butter.productId);
  });

  it("never matches across extra material qualifiers for 'carrots' vs 'organic carrots' in either direction", () => {
    const carrots = product({ productKey: "carrots", size: "1kg" });
    const organicCarrots = product({
      productKey: "carrots",
      productId: "t:organic-carrots",
      size: "1kg",
      qualifiers: ["organic"],
    });
    expect(matchItem(item("organic carrots"), [carrots], cheapest)).toBeNull();
    expect(matchItem(item("carrots"), [organicCarrots], cheapest)).toBeNull();
  });

  it("never returns unavailable products", () => {
    const unavailable = { ...semiMilk, available: false };
    expect(matchItem(item("milk"), [unavailable], cheapest)).toBeNull();
    const available = { ...semiMilk, productId: "tesco:milk-semi-b", priceMinor: 200 };
    expect(matchItem(item("milk"), [unavailable, available], cheapest)?.product.productId).toBe("tesco:milk-semi-b");
  });

  it("4 pints wanted vs a 2-pint product → multiplier 2", () => {
    const result = matchItem(item("milk", { size: "4 pints" }), [semiMilk], cheapest);
    expect(result).not.toBeNull();
    expect(result?.quantityMultiplier).toBe(2);
    expect(result?.confidence).toBe(0.85);
  });

  it("exact key and size → confidence 1, multiplier 1; more than 12 packs → no match", () => {
    expect(matchItem(item("milk", { size: "2 pints" }), [semiMilk], cheapest)).toMatchObject({
      confidence: 1,
      quantityMultiplier: 1,
    });
    expect(matchItem(item("milk", { size: "24 pints" }), [semiMilk], cheapest)?.quantityMultiplier).toBe(12);
    expect(matchItem(item("milk", { size: "26 pints" }), [semiMilk], cheapest)).toBeNull();
    expect(matchItem(item("milk", { size: "100 pints" }), [semiMilk], cheapest)).toBeNull();
  });

  it("cheapest mode picks the lower effective price (price × multiplier)", () => {
    const twoPint = { ...semiMilk, productId: "a", size: "2 pints", priceMinor: 100 }; // 2 × 100 = 200
    const fourPint = { ...semiMilk, productId: "b", size: "4 pints", priceMinor: 180 }; // 1 × 180 = 180
    const result = matchItem(item("milk", { size: "4 pints" }), [twoPint, fourPint], cheapest);
    expect(result?.product.productId).toBe("b");
    expect(result?.quantityMultiplier).toBe(1);
  });

  it("closest-match mode prefers exact size over a cheaper different size", () => {
    const twoPint = { ...semiMilk, productId: "a", size: "2 pints", priceMinor: 100 };
    const fourPint = { ...semiMilk, productId: "b", size: "4 pints", priceMinor: 250 };
    const result = matchItem(item("milk", { size: "4 pints" }), [twoPint, fourPint], { mode: "closest-match" });
    expect(result?.product.productId).toBe("b");
    expect(result?.confidence).toBe(1);
  });

  it("prefers candidates with the same measure kind when the item has a size", () => {
    const byCount = product({ productKey: "bananas", productId: "count", size: "5 pack", priceMinor: 80 });
    const byWeight = product({ productKey: "bananas", productId: "weight", size: "1kg", priceMinor: 120 });
    expect(matchItem(item("bananas", { size: "1kg" }), [byCount, byWeight], cheapest)?.product.productId).toBe("weight");
  });

  it("unmatched → null", () => {
    expect(matchItem(item("dragon fruit"), [semiMilk, oatMilk], cheapest)).toBeNull();
    expect(matchItem(item("milk"), [], cheapest)).toBeNull();
  });

  it("token-only matches are capped at 0.65 confidence (always flagged) and need ≥0.6 overlap", () => {
    const beans = product({ productKey: "baked-beans", productName: "Heinz Baked Beans 415g", brand: "Heinz", size: "415g" });
    const result = matchItem(item("heinz baked beans"), [beans], cheapest);
    expect(result).not.toBeNull();
    expect(result?.confidence).toBeLessThanOrEqual(0.65);
    expect(result?.confidence).toBeLessThan(0.7);
    expect(result?.confidence).toBeGreaterThanOrEqual(0.5);

    const natural = product({ productKey: "yoghurt-natural", productName: "Natural Yoghurt 500g", size: "500g" });
    expect(matchItem(item("strawberry yoghurt"), [natural], cheapest)).toBeNull();
  });
});
