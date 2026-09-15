import { describe, expect, it } from "vitest";
import type {
  BasketPlan,
  OptimizationResult,
  OptimizerConfig,
  OptimizerInput,
  Preferences,
} from "@/types/optimization";
import type { ProductOffer } from "@/types/products";
import type { RetailerId, StoreLocation } from "@/types/retailers";
import type { ShoppingItem } from "@/types/shopping";
import { assertMinor, formatMinor } from "@/lib/units/money";
import { DEFAULT_OPTIMIZER_CONFIG, resolveConfig } from "./config";
import { optimizeBasket } from "./engine";

const origin = { latitude: 51.5, longitude: -0.1 };
const METERS_PER_DEG_LAT = 111195;

function store(id: string, retailerId: RetailerId, metersNorth: number, metersEast = 0): StoreLocation {
  const dLat = metersNorth / METERS_PER_DEG_LAT;
  const dLng = metersEast / (METERS_PER_DEG_LAT * Math.cos((origin.latitude * Math.PI) / 180));
  return {
    id,
    retailerId,
    name: `${retailerId}-${id}`,
    latitude: origin.latitude + dLat,
    longitude: origin.longitude + dLng,
    address: "",
    distanceMeters: Math.round(Math.hypot(metersNorth, metersEast)),
  };
}

function offer(
  retailerId: RetailerId,
  priceMinor: number,
  extra: Partial<ProductOffer> = {}
): ProductOffer {
  return {
    retailerId,
    productId: `${retailerId}:p`,
    productName: "Product",
    priceMinor,
    currency: "GBP",
    availability: "available",
    confidence: 1,
    freshness: "demo",
    source: "test",
    isOwnBrand: true,
    ...extra,
  };
}

function items(...names: string[]): ShoppingItem[] {
  return names.map((name, i) => ({ id: `item-${i}`, name, quantity: 1 }));
}

/** prices[retailer] = per-item prices in item order; null = no offer. */
function offersFrom(
  prices: Partial<Record<RetailerId, (number | null)[]>>
): OptimizerInput["offers"] {
  const out: OptimizerInput["offers"] = {};
  for (const [retailerId, list] of Object.entries(prices) as [RetailerId, (number | null)[]][]) {
    const map: Record<string, ProductOffer | null> = {};
    list.forEach((price, i) => {
      map[`item-${i}`] = price === null ? null : offer(retailerId, price);
    });
    out[retailerId] = map;
  }
  return out;
}

const basePrefs: Preferences = {
  priority: "cheapest",
  maxDistanceMeters: 8000,
  maxStores: 2,
  transport: "walk",
  matchMode: "cheapest",
};

/** No travel cost and no inconvenience: isolates the grocery split guard. */
const FREE_TRAVEL: OptimizerConfig = {
  ...DEFAULT_OPTIMIZER_CONFIG,
  inconveniencePerExtraStoreMinor: 0,
  transport: {
    walk: { costPerKmMinor: 0, speedKmh: 4.8, valuePerMinuteMinor: 0 },
    bike: { costPerKmMinor: 0, speedKmh: 15, valuePerMinuteMinor: 0 },
    bus: { costPerKmMinor: 0, speedKmh: 18, valuePerMinuteMinor: 0 },
    car: { costPerKmMinor: 0, speedKmh: 30, valuePerMinuteMinor: 0 },
  },
};

function run(
  input: Partial<OptimizerInput> & Pick<OptimizerInput, "items" | "stores" | "offers">
): OptimizationResult {
  const prefs = input.prefs ?? basePrefs;
  return optimizeBasket({
    prefs,
    config: input.config ?? resolveConfig(prefs),
    origin,
    ...input,
  });
}

function allPlans(result: OptimizationResult): BasketPlan[] {
  return [
    ...(result.recommended ? [result.recommended] : []),
    ...result.alternatives.map((a) => a.plan),
  ];
}

describe("optimizeBasket", () => {
  it("cheapest single store", () => {
    const stores = [
      store("t1", "tesco", 500),
      store("a1", "aldi", 520),
      store("s1", "sainsburys", 480),
    ];
    const result = run({
      items: items("milk", "bread", "eggs"),
      stores,
      offers: offersFrom({
        tesco: [150, 140, 250], // 540
        aldi: [95, 75, 189], // 359
        sainsburys: [155, 135, 260], // 550
      }),
    });
    const rec = result.recommended;
    expect(rec?.id).toBe("aldi");
    expect(rec?.stores).toHaveLength(1);
    expect(rec?.groceriesMinor).toBe(359);
    expect(rec?.isComplete).toBe(true);
    // Next best is Tesco (540) → saving 181.
    expect(rec?.savingVsNextBestMinor).toBe(181);
    expect(result.explanation).toContain("aldi-a1");
  });

  it("two-store split when saving clears threshold after travel", () => {
    const stores = [store("t1", "tesco", 556), store("a1", "aldi", 556, 70)];
    const result = run({
      items: items("steak", "wine"),
      stores,
      offers: offersFrom({
        tesco: [300, 900],
        aldi: [800, 400],
      }),
    });
    const rec = result.recommended;
    expect(rec?.id).toBe("aldi+tesco");
    expect(rec?.stores).toHaveLength(2);
    expect(rec?.groceriesMinor).toBe(700);
    expect(rec?.inconvenienceMinor).toBe(100);
    expect(rec?.lines.map((l) => l.store?.retailerId)).toEqual(["tesco", "aldi"]);
    // Best single is 1200 at either store.
    expect(rec?.savingVsNextBestMinor).toBe(500);
    const bestSingle = result.alternatives.find((a) => a.label === "cheapest-single")?.plan;
    expect(bestSingle).toBeDefined();
    expect((bestSingle?.effectiveCostMinor ?? 0) - (rec?.effectiveCostMinor ?? 0)).toBeGreaterThanOrEqual(150);
  });

  it("marginal saving does NOT split", () => {
    // Same location → identical travel; no inconvenience. Split saves exactly 120p < 150p.
    const stores = [store("t1", "tesco", 500), store("a1", "aldi", 500)];
    const offers = offersFrom({
      tesco: [100, 520], // 620
      aldi: [220, 400], // 620
    });
    // Split = 100 + 400 = 500 → saves 120 vs the best single store (620).
    const result = run({ items: items("x", "y"), stores, offers, config: FREE_TRAVEL });
    expect(result.recommended?.stores).toHaveLength(1);
    expect(result.recommended?.groceriesMinor).toBe(620);

    // Control: a 180p saving under the same conditions does split.
    const control = run({
      items: items("x", "y"),
      stores,
      offers: offersFrom({
        tesco: [100, 600], // 700
        aldi: [300, 420], // 720
      }),
      config: FREE_TRAVEL,
    });
    // Split = 100 + 420 = 520 → saves 180 vs 700.
    expect(control.recommended?.stores).toHaveLength(2);
  });

  it("travel cost cancels split saving", () => {
    const near = store("t1", "tesco", 500);
    const far = store("a1", "aldi", -4000);
    const offers = offersFrom({
      tesco: [400, 300], // 700
      aldi: [100, 500], // 600
    });
    const prefs: Preferences = { ...basePrefs, transport: "car" };
    // Split would be 100 + 300 = 400: 300p cheaper than Tesco and 200p cheaper than Aldi.
    const result = run({ items: items("x", "y"), stores: [near, far], offers, prefs });
    expect(result.recommended?.id).toBe("tesco");
    expect(result.recommended?.stores).toHaveLength(1);

    // Without travel/inconvenience cost, the same basket does split.
    const free = run({ items: items("x", "y"), stores: [near, far], offers, prefs, config: FREE_TRAVEL });
    expect(free.recommended?.id).toBe("aldi+tesco");
    expect(free.recommended?.groceriesMinor).toBe(400);
  });

  it("missing items excluded from total and listed", () => {
    const stores = [store("t1", "tesco", 500)];
    const offers = offersFrom({ tesco: [150, 200, null] });
    (offers.tesco as Record<string, ProductOffer | null>)["item-3"] = offer("tesco", 999, {
      availability: "unavailable",
    });
    const result = run({ items: items("milk", "bread", "saffron", "oat milk"), stores, offers });
    const rec = result.recommended;
    expect(rec?.groceriesMinor).toBe(350);
    expect(rec?.itemsPriced).toBe(2);
    expect(rec?.itemsTotal).toBe(4);
    expect(rec?.isComplete).toBe(false);
    expect(rec?.missingItemIds).toEqual(["item-2", "item-3"]);
    expect(rec?.lines).toHaveLength(4);
    expect(rec?.lines[2]).toMatchObject({ status: "missing", lineTotalMinor: 0, store: null, offer: null });
    expect(rec?.lines[3]).toMatchObject({ status: "unavailable", lineTotalMinor: 0, store: null });
    expect(result.warnings).toContain("2 items couldn't be priced at any nearby store: saffron, oat milk");
    expect(result.explanation).toContain("saffron");
  });

  it("partial basket ranks below complete", () => {
    // Aldi is cheaper AND closer, but can't price eggs.
    const stores = [store("t1", "tesco", 500), store("a1", "aldi", 300)];
    const result = run({
      items: items("milk", "bread", "eggs"),
      stores,
      offers: offersFrom({
        tesco: [300, 300, 300], // complete 900
        aldi: [100, 100, null], // partial 200
      }),
      prefs: { ...basePrefs, maxStores: 1 },
    });
    expect(result.recommended?.id).toBe("tesco");
    expect(result.recommended?.isComplete).toBe(true);
    const closest = result.alternatives.find((a) => a.label === "closest")?.plan;
    expect(closest?.id).toBe("aldi");
    expect(closest?.isComplete).toBe(false);
    expect(closest?.missingItemIds).toEqual(["item-2"]);
  });

  it("quantity multiplies price", () => {
    const result = run({
      items: [{ id: "item-0", name: "beans", quantity: 3 }, { id: "item-1", name: "milk", quantity: 2 }],
      stores: [store("t1", "tesco", 500)],
      offers: offersFrom({ tesco: [250, 125] }),
    });
    expect(result.recommended?.lines.map((l) => l.lineTotalMinor)).toEqual([750, 250]);
    expect(result.recommended?.groceriesMinor).toBe(1000);
  });

  it("stores beyond maxDistance excluded", () => {
    const near = store("t1", "tesco", 1000);
    const far = store("a1", "aldi", 6000);
    const result = run({
      items: items("milk"),
      stores: [near, far],
      offers: offersFrom({ tesco: [500], aldi: [1] }),
      prefs: { ...basePrefs, maxDistanceMeters: 5000 },
    });
    expect(result.recommended?.id).toBe("tesco");
    for (const plan of allPlans(result)) {
      expect(plan.stores.map((s) => s.id)).not.toContain("a1");
    }
  });

  it("maxStores 1 never splits", () => {
    const stores = [store("t1", "tesco", 556), store("a1", "aldi", 556, 70)];
    const offers = offersFrom({ tesco: [300, 900], aldi: [800, 400] });
    const prefs: Preferences = { ...basePrefs, maxStores: 1 };
    // Even with a config that allows 3 stores and free travel.
    const result = run({ items: items("x", "y"), stores, offers, prefs, config: { ...FREE_TRAVEL, maxRecommendedStores: 3 } });
    expect(result.recommended?.stores).toHaveLength(1);
    for (const plan of allPlans(result)) expect(plan.stores).toHaveLength(1);
  });

  it("priority closest changes recommendation", () => {
    const stores = [store("t1", "tesco", 300), store("a1", "aldi", 3000)];
    const offers = offersFrom({ tesco: [1000], aldi: [600] });
    const car: Preferences = { ...basePrefs, transport: "car" };
    const cheapest = run({ items: items("big shop"), stores, offers, prefs: car });
    const closest = run({ items: items("big shop"), stores, offers, prefs: { ...car, priority: "closest" } });
    expect(cheapest.recommended?.id).toBe("aldi");
    expect(closest.recommended?.id).toBe("tesco");
    expect(closest.alternatives.some((a) => a.plan.id === "aldi")).toBe(true);
  });

  it("no stores returns null with warning", () => {
    const result = run({ items: items("milk"), stores: [], offers: {} });
    expect(result.recommended).toBeNull();
    expect(result.alternatives).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/^No supported stores within /);
    expect(result.explanation.length).toBeGreaterThan(0);

    // Stores exist but none has an offers map → same outcome.
    const unsupported = run({ items: items("milk"), stores: [store("t1", "tesco", 500)], offers: {} });
    expect(unsupported.recommended).toBeNull();
  });

  it("deterministic output", () => {
    const stores = [
      store("t1", "tesco", 500),
      store("a1", "aldi", 900, 300),
      store("s1", "sainsburys", -700),
      store("l1", "lidl", 200, -1200),
    ];
    const offers = offersFrom({
      tesco: [150, 140, 250, null],
      aldi: [95, 175, 189, 300],
      sainsburys: [155, 95, 260, 280],
      lidl: [99, 80, 180, null],
    });
    const input = { items: items("a", "b", "c", "d"), stores, offers };
    const first = run(input);
    const second = run(input);
    expect(second).toEqual(first);
    const shuffled = run({ ...input, stores: [stores[3], stores[1], stores[0], stores[2]] as StoreLocation[] });
    expect(shuffled).toEqual(first);
  });

  it("nearest branch per retailer only", () => {
    const nearTesco = store("t-near", "tesco", 400);
    const farTesco = store("t-far", "tesco", 2000);
    const aldi = store("a1", "aldi", 900);
    const result = run({
      items: items("milk", "bread"),
      stores: [farTesco, aldi, nearTesco],
      offers: offersFrom({ tesco: [100, 100], aldi: [150, 150] }),
    });
    expect(result.recommended?.stores.map((s) => s.id)).toEqual(["t-near"]);
    const ids = allPlans(result).flatMap((p) => p.stores.map((s) => s.id));
    expect(ids).not.toContain("t-far");
  });

  it("all totals are safe integers", () => {
    const stores = [
      store("t1", "tesco", 1234, 77),
      store("a1", "aldi", 2345, -910),
      store("s1", "sainsburys", -1777, 333),
    ];
    const offers = offersFrom({
      tesco: [133, 999, 251, null, 47],
      aldi: [99, 1001, null, 345, 51],
      sainsburys: [145, 870, 260, 330, null],
    });
    const itemList = items("a", "b", "c", "d", "e").map((i, idx) => ({ ...i, quantity: idx + 1 }));
    for (const transport of ["walk", "bike", "bus", "car"] as const) {
      for (const priority of ["cheapest", "balanced", "fewest-stores", "closest"] as const) {
        const prefs: Preferences = { ...basePrefs, transport, priority, maxStores: 3 };
        const result = run({
          items: itemList,
          stores,
          offers,
          prefs,
          config: resolveConfig(prefs, { ...DEFAULT_OPTIMIZER_CONFIG, maxRecommendedStores: 3 }),
        });
        const plans = allPlans(result);
        expect(plans.length).toBeGreaterThan(0);
        for (const plan of plans) {
          assertMinor(plan.groceriesMinor);
          assertMinor(plan.travelCostMinor);
          assertMinor(plan.inconvenienceMinor);
          assertMinor(plan.effectiveCostMinor);
          assertMinor(plan.savingVsNextBestMinor);
          assertMinor(plan.travelMinutes);
          assertMinor(plan.totalDistanceMeters);
          for (const line of plan.lines) assertMinor(line.lineTotalMinor);
          expect(plan.effectiveCostMinor).toBe(
            plan.groceriesMinor + plan.travelCostMinor + plan.inconvenienceMinor
          );
          expect(plan.savingVsNextBestMinor).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("allows a split that prices strictly more items than any single store, with a warning", () => {
    const stores = [store("t1", "tesco", 500), store("a1", "aldi", 500)];
    const result = run({
      items: items("x", "y"),
      stores,
      offers: offersFrom({ tesco: [100, null], aldi: [null, 100] }),
    });
    expect(result.recommended?.id).toBe("aldi+tesco");
    expect(result.recommended?.isComplete).toBe(true);
    expect(result.warnings.some((w) => w.startsWith("No single nearby store can price your whole list"))).toBe(true);
  });

  it("flags low-confidence matches by name", () => {
    const offers = offersFrom({ tesco: [100] });
    (offers.tesco as Record<string, ProductOffer | null>)["item-0"] = offer("tesco", 100, {
      confidence: 0.6,
      productName: "Heinz Beanz",
    });
    const result = run({ items: items("heinz beans"), stores: [store("t1", "tesco", 500)], offers });
    expect(result.warnings.some((w) => w.includes("heinz beans") && w.includes("Heinz Beanz"))).toBe(true);
  });

  it("alternatives are distinct, labelled, and exclude the recommendation", () => {
    const stores = [store("t1", "tesco", 300), store("a1", "aldi", 2500), store("s1", "sainsburys", 1200)];
    const result = run({
      items: items("x", "y"),
      stores,
      offers: offersFrom({ tesco: [500, 500], aldi: [200, 200], sainsburys: [350, 350] }),
      prefs: { ...basePrefs, transport: "car" },
    });
    const ids = result.alternatives.map((a) => a.plan.id);
    expect(ids.length).toBeLessThanOrEqual(3);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(result.recommended?.id);
    expect(result.alternatives.find((a) => a.label === "closest")?.plan.id).toBe("tesco");
  });

  it("throws on non-integer offer prices rather than rounding silently", () => {
    const offers = offersFrom({ tesco: [100] });
    (offers.tesco as Record<string, ProductOffer | null>)["item-0"] = offer("tesco", 1.5);
    expect(() => run({ items: items("milk"), stores: [store("t1", "tesco", 500)], offers })).toThrow();
  });
});

describe("F3 pricing regressions", () => {
  it("F-2: no saving is claimed when the plans price disjoint items (probe D)", () => {
    const result = run({
      items: items("steak", "salt"),
      stores: [store("x1", "tesco", 500), store("y1", "aldi", 500)],
      offers: offersFrom({ tesco: [500, null], aldi: [null, 50] }),
      prefs: { ...basePrefs, maxStores: 1 },
    });
    expect(result.recommended?.id).toBe("aldi");
    expect(result.recommended?.savingVsNextBestMinor).toBe(0);
    expect(result.explanation).not.toContain("less on groceries");
  });

  it("F-2: saving is measured only on the items both plans price", () => {
    const stores = [store("a1", "aldi", 500), store("t1", "tesco", 500)];
    const prefs: Preferences = { ...basePrefs, maxStores: 1 };
    // Aldi prices a+b = 100; Tesco prices b+c = 110. Only b is shared: 90 − 50 = 40.
    const result = run({ items: items("a", "b", "c"), stores, offers: offersFrom({ aldi: [50, 50, null], tesco: [null, 90, 20] }), prefs });
    expect(result.recommended?.id).toBe("aldi");
    expect(result.recommended?.savingVsNextBestMinor).toBe(40);
    expect(result.explanation).toContain("on the 1 item both price");

    // Shared item is cheaper at the comparison store → saving 0, not 440 over the unshared items.
    const dearer = run({ items: items("a", "b", "c"), stores, offers: offersFrom({ aldi: [50, 50, null], tesco: [null, 40, 500] }), prefs });
    expect(dearer.recommended?.id).toBe("aldi");
    expect(dearer.recommended?.savingVsNextBestMinor).toBe(0);
    expect(dearer.explanation).not.toContain("less on groceries");
  });

  it("F-5: a split rejected by the guard never resurfaces as 'best-balance' (probe F)", () => {
    const result = run({
      items: items("x", "y"),
      stores: [store("t1", "tesco", 500), store("a1", "aldi", 500)],
      offers: offersFrom({ tesco: [100, 520], aldi: [220, 400] }),
      prefs: { ...basePrefs, priority: "balanced" },
      config: FREE_TRAVEL,
    });
    expect(result.recommended?.stores).toHaveLength(1);
    for (const alt of result.alternatives) expect(alt.plan.stores).toHaveLength(1);
    expect(result.alternatives.map((a) => a.plan.id)).not.toContain("aldi+tesco");
  });

  it("F-6: no alternative prices zero items; 'closest' is the nearest store that prices something (probe E)", () => {
    const result = run({
      items: items("a", "b", "c"),
      stores: [store("i1", "iceland", 200), store("s1", "sainsburys", 600), store("t1", "tesco", 900)],
      offers: offersFrom({ iceland: [null, null, null], tesco: [300, 200, 100], sainsburys: [310, null, null] }),
    });
    expect(result.recommended?.id).toBe("tesco");
    expect(result.alternatives.length).toBeGreaterThan(0);
    for (const alt of result.alternatives) expect(alt.plan.itemsPriced).toBeGreaterThan(0);
    expect(result.alternatives.find((a) => a.label === "closest")?.plan.id).toBe("sainsburys");

    const onlyEmpty = run({
      items: items("a", "b", "c"),
      stores: [store("i1", "iceland", 200), store("t1", "tesco", 900)],
      offers: offersFrom({ iceland: [null, null, null], tesco: [300, 200, 100] }),
    });
    expect(onlyEmpty.alternatives.some((a) => a.plan.itemsPriced === 0)).toBe(false);
  });

  it("F-8: a third store that beats the best 2-store plan by 1p is not recommended (probe G)", () => {
    const prefs: Preferences = { ...basePrefs, maxStores: 3 };
    const result = run({
      items: items("x", "y", "z"),
      stores: [store("t1", "tesco", 500), store("a1", "aldi", 500), store("l1", "lidl", 500)],
      // 3-store = 100 + 100 + 998 = 1198; best 2-store (aldi+tesco) = 1199.
      offers: offersFrom({ tesco: [100, 999, 999], aldi: [999, 100, 1000], lidl: [999, 1000, 998] }),
      prefs,
      config: resolveConfig(prefs, FREE_TRAVEL),
    });
    expect(result.recommended?.id).toBe("aldi+tesco");
    expect(result.recommended?.groceriesMinor).toBe(1199);
    for (const alt of result.alternatives) expect(alt.plan.stores.length).toBeLessThan(3);
  });

  it("F-8: a third store saving ≥ threshold over the best 2-store plan is recommended with default maxStores 3", () => {
    const prefs: Preferences = { ...basePrefs, maxStores: 3 };
    const result = run({
      items: items("x", "y", "z"),
      stores: [store("t1", "tesco", 500), store("a1", "aldi", 500), store("l1", "lidl", 500)],
      // 3-store = 100 + 100 + 849 = 1049; best 2-store = 1199 → saves exactly 150.
      offers: offersFrom({ tesco: [100, 999, 999], aldi: [999, 100, 1000], lidl: [999, 1000, 849] }),
      prefs,
      config: resolveConfig(prefs, FREE_TRAVEL),
    });
    expect(result.recommended?.id).toBe("aldi+lidl+tesco");
    expect(result.recommended?.groceriesMinor).toBe(1049);

    // 149p over the best 2-store plan is not enough.
    const marginal = run({
      items: items("x", "y", "z"),
      stores: [store("t1", "tesco", 500), store("a1", "aldi", 500), store("l1", "lidl", 500)],
      offers: offersFrom({ tesco: [100, 999, 999], aldi: [999, 100, 1000], lidl: [999, 1000, 850] }),
      prefs,
      config: resolveConfig(prefs, FREE_TRAVEL),
    });
    expect(marginal.recommended?.id).toBe("aldi+tesco");
  });
});

describe("F6 comparison honesty", () => {
  const stores3 = [store("a1", "aldi", 200), store("t1", "tesco", 400), store("l1", "lidl", 900)];
  const offers3 = offersFrom({ aldi: [1000], tesco: [1500], lidl: [500] });

  it("R3-5: under 'closest' the cheaper-on-groceries store is named and no saving is claimed (rr-f3-engine case 1)", () => {
    const prefs: Preferences = { ...basePrefs, priority: "closest", maxStores: 3 };
    const result = run({ items: items("x"), stores: stores3, offers: offers3, prefs });
    expect(result.recommended?.id).toBe("aldi");
    expect(result.recommended?.groceriesMinor).toBe(1000);
    expect(result.recommended?.savingVsNextBestMinor).toBe(0);
    expect(result.explanation).toContain(
      "lidl-l1 is £5.00 cheaper on groceries (1.5 miles round trip) if price matters more than being closest."
    );
    expect(result.explanation).not.toContain("less on groceries");
    expect(result.explanation).not.toContain("next-best");
  });

  it("R3-5: under 'cheapest' the saving names the store it is measured against", () => {
    const prefs: Preferences = { ...basePrefs, maxStores: 3 };
    const result = run({ items: items("x"), stores: stores3, offers: offers3, prefs });
    expect(result.recommended?.id).toBe("lidl");
    expect(result.recommended?.savingVsNextBestMinor).toBe(500);
    expect(result.explanation).toMatch(/^Your cheapest option is lidl-l1 /);
    expect(result.explanation).toContain("That's £5.00 less on groceries than aldi-a1.");
  });

  it("R3-5: under 'cheapest' a store that is cheaper on groceries but loses on travel is named, never out-saved", () => {
    const stores = [store("t1", "tesco", 300), store("a1", "aldi", 3000)];
    const result = run({ items: items("x"), stores, offers: offersFrom({ tesco: [1000], aldi: [900] }) });
    const rec = result.recommended;
    const aldi = result.alternatives.find((a) => a.plan.id === "aldi")?.plan;
    expect(rec?.id).toBe("tesco");
    expect(aldi).toBeDefined();
    expect(rec?.savingVsNextBestMinor).toBe(0);
    const overall = formatMinor((aldi?.effectiveCostMinor ?? 0) - (rec?.effectiveCostMinor ?? 0));
    expect(result.explanation).toMatch(/^Your cheapest option once travel is counted is tesco-t1 /);
    expect(result.explanation).toContain(
      `aldi-a1 is £1.00 cheaper on groceries, but it's 4.8 miles round trip, so once travel and time are counted it costs ${overall} more overall.`
    );
    expect(result.explanation).not.toContain("less on groceries");
  });

  it("R3-5: the comparison store must price at least as many items as the recommendation", () => {
    const stores = [store("t1", "tesco", 500), store("a1", "aldi", 500, 1), store("s1", "sainsburys", 500, 2)];
    const result = run({
      items: items("x", "y"),
      stores,
      offers: offersFrom({ tesco: [300, 300], aldi: [100, null], sainsburys: [400, 400] }),
      prefs: { ...basePrefs, maxStores: 1 },
    });
    expect(result.recommended?.id).toBe("tesco");
    expect(result.recommended?.savingVsNextBestMinor).toBe(200);
    expect(result.explanation).toContain("That's £2.00 less on groceries than sainsburys-s1.");
    expect(result.explanation).not.toContain("aldi-a1");
    expect(result.explanation).toMatch(/^Your cheapest option is tesco-t1 /);
  });

  it("R3-4: estimated-quantity lines get their own warning and are not repeated as low-confidence", () => {
    const shopping: ShoppingItem[] = [
      { id: "item-0", name: "bananas", quantity: 1, size: "12 pack" },
      { id: "item-1", name: "apples", quantity: 1, size: "4 pack" },
      { id: "item-2", name: "heinz beans", quantity: 1 },
    ];
    const offers: OptimizerInput["offers"] = {
      tesco: {
        "item-0": offer("tesco", 148, { productName: "Tesco Bananas", size: "2 × 1kg", confidence: 0.65, quantityEstimated: true }),
        "item-1": offer("tesco", 195, { productName: "Gala Apples", size: "1kg", confidence: 0.65, quantityEstimated: true }),
        "item-2": offer("tesco", 100, { productName: "Heinz Beanz", confidence: 0.6 }),
      },
    };
    const result = run({ items: shopping, stores: [store("t1", "tesco", 500)], offers });
    expect(result.warnings).toContain(
      "Quantity estimated from typical weights, check before you buy: 12 bananas (2 × 1kg), 4 apples (1 × 1kg)"
    );
    const lowConfidence = result.warnings.filter((w) => w.startsWith("Low-confidence matches"));
    expect(lowConfidence).toHaveLength(1);
    expect(lowConfidence[0]).toContain("heinz beans (Heinz Beanz at tesco-t1)");
    expect(lowConfidence[0]).not.toContain("bananas");
    expect(lowConfidence[0]).not.toContain("apples");
  });
});

describe("F7 comparison honesty", () => {
  const caseAStores = [store("a1", "aldi", 200), store("t1", "tesco", 3000), store("l1", "lidl", 3000, 10)];
  const caseAOffers = offersFrom({ aldi: [100, 100, null], tesco: [150, null, 1], lidl: [90, 100, null] });

  it.each(["cheapest", "closest", "balanced", "fewest-stores"] as const)(
    "M1: under '%s' the comparison is chosen on the items both plans price (case A names LIDL, saving 0)",
    (priority) => {
      const prefs: Preferences = { ...basePrefs, priority, maxStores: 1 };
      const result = run({ items: items("x", "y", "z"), stores: caseAStores, offers: caseAOffers, prefs });
      expect(result.recommended?.id).toBe("aldi");
      expect(result.recommended?.savingVsNextBestMinor).toBe(0);
      expect(result.explanation).toContain("lidl-l1 is £0.10 cheaper on groceries");
      expect(result.explanation).not.toContain("less on groceries");
      expect(result.explanation).not.toContain("tesco-t1");
      if (priority === "cheapest") {
        expect(result.explanation).toMatch(/^Your cheapest option once travel is counted is aldi-a1 /);
      }
    }
  );

  it("M1: with no cheaper candidate, the smallest shared-item saving is claimed against that store", () => {
    const stores = [store("a1", "aldi", 200), store("t1", "tesco", 3000), store("l1", "lidl", 3000, 10)];
    const result = run({
      items: items("x", "y", "z"),
      stores,
      offers: offersFrom({ aldi: [100, 100, null], tesco: [150, null, 1], lidl: [110, 100, null] }),
      prefs: { ...basePrefs, maxStores: 1 },
    });
    expect(result.recommended?.id).toBe("aldi");
    expect(result.recommended?.savingVsNextBestMinor).toBe(10);
    expect(result.explanation).toMatch(/^Your cheapest option is aldi-a1 /);
    expect(result.explanation).toContain("That's £0.10 less on groceries than lidl-l1.");
  });

  it("M2: 'costs £Y more overall' is never stated when the plans price different items (case G)", () => {
    const result = run({
      items: items("x", "y", "z"),
      stores: [store("a1", "aldi", 200), store("l1", "lidl", 3000)],
      offers: offersFrom({ aldi: [100, 100, null], lidl: [50, null, 1000] }),
      prefs: { ...basePrefs, maxStores: 1 },
    });
    expect(result.recommended?.id).toBe("aldi");
    expect(result.recommended?.savingVsNextBestMinor).toBe(0);
    expect(result.explanation).not.toContain("more overall");
    expect(result.explanation).toMatch(
      /lidl-l1 is £0\.50 cheaper on groceries on the 1 item both price \(\d+\.\d miles round trip\), but it doesn't price the same items, so it isn't directly comparable\./
    );
    // R7-1: distance is never framed as the drawback when the item sets differ.
    expect(result.explanation).not.toContain("but it's");
  });

  it("L1: under 'fewest-stores' with equal store counts the trade-off is a shorter trip (case B)", () => {
    const result = run({
      items: items("x"),
      stores: [store("a1", "aldi", 200), store("l1", "lidl", 3000)],
      offers: offersFrom({ aldi: [1000], lidl: [950] }),
      prefs: { ...basePrefs, priority: "fewest-stores" },
    });
    expect(result.recommended?.id).toBe("aldi");
    expect(result.explanation).toMatch(/lidl-l1 is £0\.50 cheaper on groceries \(\d+\.\d miles round trip\) if price matters more than a shorter trip\./);
    expect(result.explanation).not.toContain("fewer stores");
  });

  it("L2: an estimated quantity at the comparison store is flagged next to its name (case E1)", () => {
    const shopping: ShoppingItem[] = [{ id: "item-0", name: "bananas", quantity: 1, size: "12 pack" }];
    const offers: OptimizerInput["offers"] = {
      aldi: { "item-0": offer("aldi", 150, { size: "12 pack", confidence: 0.85 }) },
      tesco: { "item-0": offer("tesco", 148, { size: "2 × 1kg", confidence: 0.65, quantityEstimated: true }) },
    };
    const result = run({ items: shopping, stores: [store("a1", "aldi", 200), store("t1", "tesco", 3000)], offers });
    expect(result.recommended?.id).toBe("aldi");
    expect(result.explanation).toContain("tesco-t1 (estimated quantity) is £0.02 cheaper on groceries, but it's");
  });

  it("L3: the estimated-quantity warning shows the line quantity when more than one", () => {
    const shopping: ShoppingItem[] = [
      { id: "item-0", name: "bananas", quantity: 2, size: "6 pack" },
      { id: "item-1", name: "apples", quantity: 1, size: "6 pack" },
    ];
    const offers: OptimizerInput["offers"] = {
      tesco: {
        "item-0": offer("tesco", 148, { size: "2 × 1kg", confidence: 0.65, quantityEstimated: true }),
        "item-1": offer("tesco", 195, { size: "1kg", confidence: 0.65, quantityEstimated: true }),
      },
    };
    const result = run({ items: shopping, stores: [store("t1", "tesco", 500)], offers });
    expect(result.warnings).toContain(
      "Quantity estimated from typical weights, check before you buy: 6 bananas × 2 (2 × 1kg), 6 apples (1 × 1kg)"
    );
  });

  it("L6: a plan that prices nothing is never recommended", () => {
    const result = run({
      items: items("milk", "eggs"),
      stores: [store("t1", "tesco", 300)],
      offers: offersFrom({ tesco: [null, null] }),
      unreachableRetailerIds: ["aldi"],
    });
    expect(result.recommended).toBeNull();
    expect(result.alternatives).toEqual([]);
    expect(result.warnings).toEqual(["None of your items could be priced at the stores we could reach."]);
    expect(result.explanation).toContain("None of your items could be priced at the stores we could reach.");
    expect(result.explanation).not.toContain("£0.00");
  });

  it("L6: the 'couldn't be priced' warning only claims the stores we could reach when a retailer failed", () => {
    const input = {
      items: items("x", "y"),
      stores: [store("t1", "tesco", 300)],
      offers: offersFrom({ tesco: [100, null] }),
    };
    expect(run({ ...input, unreachableRetailerIds: ["aldi"] }).warnings).toContain(
      "1 item couldn't be priced at any nearby store we could reach: y"
    );
    expect(run({ ...input, unreachableRetailerIds: [] }).warnings).toContain(
      "1 item couldn't be priced at any nearby store: y"
    );
    expect(run(input).warnings).toContain("1 item couldn't be priced at any nearby store: y");
  });
});

describe("resolveConfig", () => {
  it("caps maxRecommendedStores by prefs.maxStores without mutating the base", () => {
    expect(resolveConfig({ ...basePrefs, maxStores: 1 }).maxRecommendedStores).toBe(1);
    expect(resolveConfig({ ...basePrefs, maxStores: 2 }).maxRecommendedStores).toBe(2);
    expect(resolveConfig({ ...basePrefs, maxStores: 3 }).maxRecommendedStores).toBe(3);
    const resolved = resolveConfig({ ...basePrefs, maxStores: 1 });
    resolved.transport.car.costPerKmMinor = 999;
    expect(DEFAULT_OPTIMIZER_CONFIG.maxRecommendedStores).toBe(3);
    expect(DEFAULT_OPTIMIZER_CONFIG.transport.car.costPerKmMinor).toBe(25);
  });
});
