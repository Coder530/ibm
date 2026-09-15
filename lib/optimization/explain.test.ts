import { describe, expect, it } from "vitest";
import type { BasketLine, BasketPlan, Preferences } from "@/types/optimization";
import type { ProductOffer } from "@/types/products";
import type { StoreLocation } from "@/types/retailers";
import { explainResult, formatDistance, type SavingBasis } from "./explain";

const prefs: Preferences = {
  priority: "cheapest",
  maxDistanceMeters: 8000,
  maxStores: 2,
  transport: "walk",
  matchMode: "cheapest",
};

const aldi: StoreLocation = {
  id: "osm-1",
  retailerId: "aldi",
  name: "Aldi Camden",
  latitude: 51.5,
  longitude: -0.1,
  address: "",
  distanceMeters: 1200,
};

function plan(overrides: Partial<BasketPlan> = {}): BasketPlan {
  return {
    id: "aldi",
    stores: [aldi],
    lines: [
      { itemId: "item-0", itemName: "milk", quantity: 1, store: aldi, offer: null, lineTotalMinor: 125, status: "priced" },
    ],
    groceriesMinor: 2340,
    travelCostMinor: 90,
    inconvenienceMinor: 0,
    effectiveCostMinor: 2430,
    missingItemIds: [],
    itemsPriced: 1,
    itemsTotal: 1,
    travelMinutes: 30,
    totalDistanceMeters: 3120,
    savingVsNextBestMinor: 310,
    isComplete: true,
    ...overrides,
  };
}

const tesco: StoreLocation = { ...aldi, id: "osm-2", retailerId: "tesco", name: "Tesco Express", distanceMeters: 2414 };

function tescoPlan(overrides: Partial<BasketPlan> = {}): BasketPlan {
  return plan({
    id: "tesco",
    stores: [tesco],
    groceriesMinor: 2211,
    effectiveCostMinor: 2600,
    totalDistanceMeters: 4828,
    savingVsNextBestMinor: 0,
    ...overrides,
  });
}

function basis(overrides: Partial<SavingBasis> = {}): SavingBasis {
  return {
    itemsCompared: 1,
    comparisonItemsPriced: 1,
    comparison: tescoPlan({ groceriesMinor: 2650 }),
    groceryDifferenceMinor: 310,
    ...overrides,
  };
}

describe("explainResult", () => {
  it("mentions the store name, total and saving", () => {
    const text = explainResult({ recommended: plan(), alternatives: [], warnings: [] }, prefs, basis());
    expect(text).toContain("Aldi Camden");
    expect(text).toContain("£23.40");
    expect(text).toContain("That's £3.10 less on groceries than Tesco Express.");
    expect(text).toContain("walking");
  });

  it("V3b: never makes a comparison claim without naming what it compares against", () => {
    const text = explainResult({ recommended: plan(), alternatives: [], warnings: [] }, prefs);
    expect(text).not.toContain("less on groceries");
    expect(text).not.toContain("next-best");
  });

  it("R3-5: under 'cheapest', a store cheaper on groceries is named with the overall cost of getting there", () => {
    const cheaper = basis({ groceryDifferenceMinor: -129, comparison: tescoPlan() });
    const text = explainResult(
      { recommended: plan({ savingVsNextBestMinor: 0 }), alternatives: [], warnings: [] },
      prefs,
      cheaper
    );
    expect(text).toMatch(/^Your cheapest option once travel is counted is Aldi Camden \(/);
    expect(text).toContain(
      "Tesco Express is £1.29 cheaper on groceries, but it's 3.0 miles round trip, so once travel and time are counted it costs £1.70 more overall."
    );
    expect(text).not.toContain("less on groceries");
  });

  it.each([
    ["closest", "Your closest option is Aldi Camden", "being closest"],
    ["fewest-stores", "Your simplest option is Aldi Camden", "a shorter trip"],
    ["balanced", "Your best balance of price and travel is Aldi Camden", "balance"],
  ] as const)("R3-5: under '%s', a cheaper-on-groceries store is offered as a trade-off", (priority, opening, tradeOff) => {
    const cheaper = basis({ groceryDifferenceMinor: -129, comparison: tescoPlan() });
    const text = explainResult(
      { recommended: plan({ savingVsNextBestMinor: 0 }), alternatives: [], warnings: [] },
      { ...prefs, priority },
      cheaper
    );
    expect(text.startsWith(opening)).toBe(true);
    expect(text).toContain(
      `Tesco Express is £1.29 cheaper on groceries (3.0 miles round trip) if price matters more than ${tradeOff}.`
    );
    expect(text).not.toContain("once travel is counted");
    expect(text).not.toContain("less on groceries");
  });

  it("R3-5: the plain 'cheapest' opening stays when no single store is cheaper on groceries", () => {
    const text = explainResult({ recommended: plan(), alternatives: [], warnings: [] }, prefs, basis());
    expect(text).toMatch(/^Your cheapest option is Aldi Camden \(/);
  });

  it("mentions missing items when the basket is partial", () => {
    const partial = plan({
      lines: [
        { itemId: "item-0", itemName: "milk", quantity: 1, store: aldi, offer: null, lineTotalMinor: 125, status: "priced" },
        { itemId: "item-1", itemName: "saffron", quantity: 1, store: null, offer: null, lineTotalMinor: 0, status: "missing" },
        { itemId: "item-2", itemName: "oat milk", quantity: 1, store: null, offer: null, lineTotalMinor: 0, status: "unavailable" },
      ],
      missingItemIds: ["item-1", "item-2"],
      itemsPriced: 1,
      itemsTotal: 3,
      isComplete: false,
    });
    const text = explainResult({ recommended: partial, alternatives: [], warnings: [] }, prefs);
    expect(text).toContain("1 of 3 items");
    expect(text).toContain("saffron");
    expect(text).toContain("oat milk");
    expect(text).toContain("aren't included in the total");
  });

  it("names every store for a split and the extra-stop cost", () => {
    const tesco: StoreLocation = { ...aldi, id: "osm-2", retailerId: "tesco", name: "Tesco Express" };
    const text = explainResult(
      { recommended: plan({ id: "aldi+tesco", stores: [aldi, tesco], inconvenienceMinor: 100 }), alternatives: [], warnings: [] },
      { ...prefs, priority: "balanced" }
    );
    expect(text).toContain("split your shop between Aldi Camden and Tesco Express");
    expect(text).toContain("£1.00 for the extra stop");
  });

  it("explains why there is no recommendation", () => {
    const text = explainResult(
      { recommended: null, alternatives: [], warnings: ["No supported stores within 5.0 miles"] },
      prefs
    );
    expect(text).toContain("couldn't build a basket");
    expect(text).toContain("No supported stores within 5.0 miles.");
  });

  it("omits the saving sentence when there is no saving", () => {
    const text = explainResult({ recommended: plan({ savingVsNextBestMinor: 0 }), alternatives: [], warnings: [] }, prefs);
    expect(text).not.toContain("less on groceries");
  });

  it("F-2: qualifies the saving when the comparison plan prices different items", () => {
    const partial = plan({ itemsPriced: 3, itemsTotal: 4, savingVsNextBestMinor: 120, isComplete: false });
    const text = explainResult(
      { recommended: partial, alternatives: [], warnings: [] },
      prefs,
      basis({ itemsCompared: 2, comparisonItemsPriced: 2, groceryDifferenceMinor: 120 })
    );
    expect(text).toContain("£1.20 less on groceries than Tesco Express on the 2 items both price.");

    const single = explainResult(
      { recommended: partial, alternatives: [], warnings: [] },
      prefs,
      basis({ itemsCompared: 1, comparisonItemsPriced: 3, groceryDifferenceMinor: 120 })
    );
    expect(single).toContain("on the 1 item both price.");

    const same = explainResult(
      { recommended: partial, alternatives: [], warnings: [] },
      prefs,
      basis({ itemsCompared: 3, comparisonItemsPriced: 3, groceryDifferenceMinor: 120 })
    );
    expect(same).toContain("£1.20 less on groceries than Tesco Express.");
    expect(same).not.toContain("both price");
  });
});

describe("F7 explanation honesty", () => {
  const offer = (extra: Partial<ProductOffer> = {}): ProductOffer => ({
    retailerId: "tesco",
    productId: "tesco:p",
    productName: "Product",
    priceMinor: 100,
    currency: "GBP",
    availability: "available",
    confidence: 1,
    freshness: "demo",
    source: "test",
    isOwnBrand: true,
    ...extra,
  });
  const line = (itemId: string, store: StoreLocation, extra: Partial<BasketLine> = {}): BasketLine => ({
    itemId,
    itemName: itemId,
    quantity: 1,
    store,
    offer: offer(),
    lineTotalMinor: 100,
    status: "priced",
    ...extra,
  });
  const missing = (itemId: string): BasketLine => ({
    itemId,
    itemName: itemId,
    quantity: 1,
    store: null,
    offer: null,
    lineTotalMinor: 0,
    status: "missing",
  });

  it("M1: the 'once travel is counted' opening follows the chosen comparison's grocery difference", () => {
    const recommended = plan({ savingVsNextBestMinor: 0 });
    const cheaper = explainResult({ recommended, alternatives: [], warnings: [] }, prefs, basis({ groceryDifferenceMinor: -10, comparison: tescoPlan() }));
    expect(cheaper).toMatch(/^Your cheapest option once travel is counted is Aldi Camden \(/);
    expect(cheaper).toContain("Tesco Express is £0.10 cheaper on groceries");

    const tie = explainResult({ recommended, alternatives: [], warnings: [] }, prefs, basis({ groceryDifferenceMinor: 0 }));
    expect(tie).toMatch(/^Your cheapest option is Aldi Camden \(/);
    expect(tie).not.toContain("cheaper on groceries");
  });

  it("M2: no 'more overall' figure when the plans price different items", () => {
    const recommended = plan({
      lines: [line("item-0", aldi), line("item-1", aldi), missing("item-2")],
      itemsPriced: 2,
      itemsTotal: 3,
      isComplete: false,
      savingVsNextBestMinor: 0,
    });
    const comparison = tescoPlan({
      lines: [line("item-0", tesco), missing("item-1"), line("item-2", tesco)],
      itemsPriced: 2,
      itemsTotal: 3,
      isComplete: false,
      effectiveCostMinor: 3553,
    });
    const text = explainResult(
      { recommended, alternatives: [], warnings: [] },
      prefs,
      basis({ itemsCompared: 1, comparisonItemsPriced: 2, groceryDifferenceMinor: -50, comparison })
    );
    expect(text).toMatch(/^Your cheapest option once travel is counted is Aldi Camden \(/);
    expect(text).toContain(
      "Tesco Express is £0.50 cheaper on groceries on the 1 item both price (3.0 miles round trip), but it doesn't price the same items, so it isn't directly comparable."
    );
    expect(text).not.toContain("more overall");
  });

  it("L1: under 'fewest-stores' a comparison with fewer stores keeps the 'fewer stores' trade-off", () => {
    const split = plan({ id: "aldi+tesco", stores: [aldi, tesco], savingVsNextBestMinor: 0 });
    const text = explainResult(
      { recommended: split, alternatives: [], warnings: [] },
      { ...prefs, priority: "fewest-stores" },
      basis({ groceryDifferenceMinor: -129, comparison: tescoPlan() })
    );
    expect(text).toContain("if price matters more than fewer stores.");
  });

  it("L2: an estimated quantity on a shared comparison line is flagged after the store name", () => {
    const comparison = tescoPlan({ lines: [line("item-0", tesco, { offer: offer({ quantityEstimated: true }) })] });
    const text = explainResult(
      { recommended: plan({ savingVsNextBestMinor: 0 }), alternatives: [], warnings: [] },
      prefs,
      basis({ groceryDifferenceMinor: -129, comparison })
    );
    expect(text).toContain("Tesco Express (estimated quantity) is £1.29 cheaper on groceries, but it's 3.0 miles round trip");

    const notShared = tescoPlan({
      lines: [line("item-0", tesco), line("item-9", tesco, { offer: offer({ quantityEstimated: true }) })],
    });
    const plain = explainResult(
      { recommended: plan({ savingVsNextBestMinor: 0 }), alternatives: [], warnings: [] },
      prefs,
      basis({ groceryDifferenceMinor: -129, comparison: notShared })
    );
    expect(plain).not.toContain("(estimated quantity)");
  });
});

describe("formatDistance", () => {
  it("formats metres as miles to one decimal", () => {
    expect(formatDistance(8046.72)).toBe("5.0 miles");
    expect(formatDistance(1609.344)).toBe("1.0 mile");
    expect(formatDistance(0)).toBe("0.0 miles");
  });
});
