import { describe, expect, it } from "vitest";
import type { OptimizationResult, OptimizerInput, Preferences } from "@/types/optimization";
import { RETAILER_IDS, type RetailerId, type StoreLocation } from "@/types/retailers";
import { parseShoppingList } from "@/lib/products/parseList";
import { ADAPTERS } from "@/lib/retailers/registry";
import { resolveConfig } from "@/lib/optimization/config";
import { optimizeBasket } from "@/lib/optimization/engine";

/**
 * End-to-end regressions for SPEC F3: real parser → demo catalog adapters →
 * optimizer. Store locations are synthetic; prices come from the DEMO catalog.
 */

const origin = { latitude: 51.5, longitude: -0.1 };

function store(retailerId: RetailerId, metersNorth: number): StoreLocation {
  return {
    id: `${retailerId}-1`,
    retailerId,
    name: `${retailerId} test store`,
    latitude: origin.latitude + metersNorth / 111195,
    longitude: origin.longitude,
    address: "",
    distanceMeters: metersNorth,
  };
}

const basePrefs: Preferences = {
  priority: "cheapest",
  maxDistanceMeters: 8000,
  maxStores: 1,
  transport: "walk",
  matchMode: "cheapest",
};

async function compare(
  text: string,
  stores: StoreLocation[],
  prefs: Preferences = basePrefs
): Promise<OptimizationResult> {
  const { items } = parseShoppingList(text);
  const offers: OptimizerInput["offers"] = {};
  for (const s of stores) {
    const found = await ADAPTERS[s.retailerId].findOffers(items, { mode: prefs.matchMode });
    offers[s.retailerId] = Object.fromEntries(found);
  }
  return optimizeBasket({ items, stores, offers, prefs, config: resolveConfig(prefs), origin });
}

describe("pricing regressions (parse → demo adapter → engine)", () => {
  it("F-1: '6 bananas' at Tesco is ONE 1kg bag, flagged as an estimated quantity", async () => {
    const result = await compare("6 bananas", [store("tesco", 500)]);
    const bananas = result.recommended?.lines[0];
    expect(bananas?.status).toBe("priced");
    expect(bananas?.offer?.size).toBe("1kg");
    expect(bananas?.lineTotalMinor).toBe(74);
    expect(bananas?.offer?.confidence).toBe(0.65);
    expect(bananas?.offer?.quantityEstimated).toBe(true);
    expect(result.warnings).toContain(
      "Quantity estimated from typical weights, check before you buy: 6 bananas (1 × 1kg)"
    );
    expect(result.warnings.some((w) => w.startsWith("Low-confidence matches"))).toBe(false);
  });

  it.each([
    ["2 boxes of eggs", 2, "6 pack", 448],
    ["2 packs of toilet roll", 2, "9 pack", 994],
    ["2 boxes of tea bags", 2, "80 pack", 484],
    ["2 bunches of bananas", 2, "1kg", 148],
    ["3 tins of beans", 3, "4 pack", 642],
  ])("R3-1: '%s' at Tesco is %d × one %s pack (%dp)", async (text, quantity, size, total) => {
    const result = await compare(text, [store("tesco", 500)]);
    const line = result.recommended?.lines[0];
    expect(line).toMatchObject({ status: "priced", quantity, lineTotalMinor: total });
    expect(line?.offer?.size).toBe(size);
  });

  it.each(["beef mince 20%", "20 % fat beef mince", "20 percent fat mince", "skimmed milk 1%", "greek yoghurt 0%"])(
    "R3-2/R3-3: '%s' is one item and never priced as a product without that percentage, at any retailer",
    async (text) => {
      const { items } = parseShoppingList(text);
      expect(items).toHaveLength(1);
      expect(items[0]?.quantity).toBe(1);
      for (const retailerId of RETAILER_IDS) {
        const offers = await ADAPTERS[retailerId].findOffers(items, { mode: "cheapest" });
        expect(offers.get("item-0") ?? null, `${text} @ ${retailerId}`).toBeNull();
      }
    }
  );

  it("R3-2: '5 % fat mince' still finds Beef Mince 5% Fat", async () => {
    const result = await compare("5 % fat mince", [store("tesco", 500)]);
    expect(result.recommended?.lines[0]).toMatchObject({ status: "priced", quantity: 1, lineTotalMinor: 393 });
    expect(result.recommended?.lines[0]?.offer?.productName).toBe("Tesco Beef Mince 5% Fat");
  });

  it("R3-4: counts of weight-sold produce buy enough bags for the typical weight, or surface as missing", async () => {
    const twelve = await compare("12 bananas", [store("tesco", 500)]);
    const line = twelve.recommended?.lines[0];
    expect(line).toMatchObject({ status: "priced", lineTotalMinor: 148 });
    expect(line?.offer).toMatchObject({ size: "2 × 1kg", confidence: 0.65, quantityEstimated: true });
    expect(twelve.warnings).toContain(
      "Quantity estimated from typical weights, check before you buy: 12 bananas (2 × 1kg)"
    );

    const ninetyNine = await compare("99 bananas", [store("tesco", 500)]);
    expect(ninetyNine.recommended?.lines[0]).toMatchObject({ status: "priced", lineTotalMinor: 888 });

    // Nothing priced: no plan is recommended (L6), and the reason is stated.
    const fiveHundred = await compare("500 bananas", [store("tesco", 500)]);
    expect(fiveHundred.recommended).toBeNull();
    expect(fiveHundred.warnings).toEqual(["None of your items could be priced at the stores we could reach."]);
    expect(fiveHundred.explanation).toContain("None of your items could be priced");
  });

  it("R3-5: under 'closest' the nearer store never claims a saving over a cheaper, farther store", async () => {
    // Demo catalog: Tesco bananas 74p, Lidl bananas 53p.
    const result = await compare("bananas", [store("tesco", 300), store("lidl", 2000)], {
      ...basePrefs,
      priority: "closest",
    });
    expect(result.recommended?.stores.map((s) => s.retailerId)).toEqual(["tesco"]);
    expect(result.recommended?.savingVsNextBestMinor).toBe(0);
    expect(result.explanation).toContain("lidl test store is £0.21 cheaper on groceries");
    expect(result.explanation).not.toContain("less on groceries");
  });

  it("F-1: counts of countable items buy the fewest packs that cover the count", async () => {
    // Distinct products: duplicate counts now merge first (R3-7).
    const result = await compare("3 bagels\n2 avocados\n8 eggs", [store("tesco", 500)]);
    const lines = result.recommended?.lines ?? [];
    expect(lines).toHaveLength(3);
    // "3 bagels" → one 5-pack (131p); "2 avocados" → one 4-pack (235p); "8 eggs" → 2 × 6-pack.
    expect(lines.map((l) => l.lineTotalMinor)).toEqual([131, 235, 448]);
    expect(lines.map((l) => l.offer?.size)).toEqual(["5 pack", "4 pack", "2 × 6 pack"]);
    expect(result.recommended?.groceriesMinor).toBe(131 + 235 + 448);
  });

  it("F-7: '10 dozen eggs' is never priced as 72 eggs; it surfaces as a missing line", async () => {
    const result = await compare("10 dozen eggs\nmilk", [store("tesco", 500)]);
    const eggs = result.recommended?.lines[0];
    expect(eggs).toMatchObject({ status: "missing", offer: null, lineTotalMinor: 0 });
    expect(result.recommended?.missingItemIds).toEqual(["item-0"]);
    expect(result.explanation).toContain("couldn't be priced");
  });

  it("F-4: bare 'pepper' is never priced as bell peppers; it surfaces as missing", async () => {
    const result = await compare("milk, pepper", [store("tesco", 500), store("aldi", 800)]);
    const pepper = result.recommended?.lines.find((l) => l.itemName === "pepper");
    expect(pepper).toMatchObject({ status: "missing", offer: null, lineTotalMinor: 0 });
    expect(result.warnings).toContain("1 item couldn't be priced at any nearby store: pepper");
    expect(result.explanation).toContain("pepper");

    const peppers = await compare("peppers", [store("tesco", 500)]);
    expect(peppers.recommended?.lines[0]?.offer?.productName).toBe("Tesco Mixed Peppers");
  });

  it("M3: '2 packs of 12 eggs' at Tesco is 2 × (2 × 6-pack) = 896p", async () => {
    const result = await compare("2 packs of 12 eggs", [store("tesco", 500)]);
    const line = result.recommended?.lines[0];
    expect(line).toMatchObject({ status: "priced", quantity: 2, lineTotalMinor: 896 });
    expect(line?.offer?.size).toBe("2 × 6 pack");
  });

  it("M3: 'a bag of 6 apples' is a count of six apples, estimated against a 1kg bag", async () => {
    const result = await compare("a bag of 6 apples", [store("tesco", 500)]);
    const line = result.recommended?.lines[0];
    expect(line).toMatchObject({ status: "priced", quantity: 1 });
    expect(line?.offer).toMatchObject({ size: "1kg", quantityEstimated: true });
  });

  it("M4: '2 organic bananas' and '3 bananas' stay separate lines; the plain bananas are still priced", async () => {
    const result = await compare("2 organic bananas\n3 bananas", [store("tesco", 500)]);
    const lines = result.recommended?.lines ?? [];
    expect(lines.map((l) => l.itemName)).toEqual(["organic bananas", "bananas"]);
    expect(lines[1]).toMatchObject({ status: "priced", lineTotalMinor: 74 });
  });

  it("M5: counts of potatoes, carrots and tomatoes are one pack, never one bag per item", async () => {
    const potatoes = (await compare("6 potatoes", [store("tesco", 500)])).recommended?.lines[0];
    expect(potatoes).toMatchObject({ status: "priced", quantity: 1, lineTotalMinor: 213 });
    expect(potatoes?.offer).toMatchObject({ size: "2.5kg", quantityEstimated: true });

    const carrots = (await compare("6 carrots", [store("tesco", 500)])).recommended?.lines[0];
    expect(carrots).toMatchObject({ status: "priced", quantity: 1, lineTotalMinor: 69 });
    expect(carrots?.offer).toMatchObject({ size: "1kg", quantityEstimated: true });

    const tomatoes = (await compare("6 tomatoes", [store("tesco", 500)])).recommended?.lines[0];
    expect(tomatoes).toMatchObject({ status: "priced", quantity: 1, lineTotalMinor: 152 });
    expect(tomatoes?.offer?.size).toBe("6 pack");
    expect(tomatoes?.offer?.quantityEstimated).toBeUndefined();
  });

  it("F-2: stores pricing different items never claim a grocery saving", async () => {
    // Demo catalog: Aldi has eggs but no bananas; Iceland has bananas but no eggs.
    const result = await compare("bananas\neggs", [store("aldi", 500), store("iceland", 500)]);
    expect(result.recommended?.itemsPriced).toBe(1);
    expect(result.recommended?.savingVsNextBestMinor).toBe(0);
    expect(result.explanation).not.toContain("less on groceries");
  });
});
