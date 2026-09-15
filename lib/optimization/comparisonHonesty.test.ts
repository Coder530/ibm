import { describe, expect, it } from "vitest";
import type { Preferences } from "@/types/optimization";
import type { ProductOffer } from "@/types/products";
import type { RetailerId, StoreLocation } from "@/types/retailers";
import { optimizeBasket } from "./engine";
import { resolveConfig } from "./config";

// Regression tests for the F7 narrow re-review (R7-1, R7-2): comparison copy
// must never frame the nearer store's distance as a drawback, and a fallback
// comparison that prices fewer items must never produce a saving stamp.

const ORIGIN = { latitude: 51.5, longitude: -0.1 };
const METERS_PER_DEGREE = 111195;

function store(id: string, retailerId: RetailerId, northMeters: number): StoreLocation {
  return {
    id,
    retailerId,
    name: retailerId.toUpperCase(),
    address: "",
    latitude: ORIGIN.latitude + northMeters / METERS_PER_DEGREE,
    longitude: ORIGIN.longitude,
    distanceMeters: northMeters,
  };
}

function offer(retailerId: RetailerId, priceMinor: number): ProductOffer {
  return {
    retailerId,
    productId: `${retailerId}:p`,
    productName: `${retailerId} product`,
    priceMinor,
    currency: "GBP",
    availability: "available",
    confidence: 1,
    freshness: "demo",
    source: "test",
    isOwnBrand: true,
  };
}

function offersFrom(
  byRetailer: Partial<Record<RetailerId, (number | null)[]>>
): Partial<Record<RetailerId, Record<string, ProductOffer | null>>> {
  const out: Partial<Record<RetailerId, Record<string, ProductOffer | null>>> = {};
  for (const [retailerId, prices] of Object.entries(byRetailer) as [RetailerId, (number | null)[]][]) {
    out[retailerId] = Object.fromEntries(
      prices.map((price, i) => [`item-${i}`, price === null ? null : offer(retailerId, price)])
    );
  }
  return out;
}

function items(...names: string[]): { id: string; name: string; quantity: number }[] {
  return names.map((name, i) => ({ id: `item-${i}`, name, quantity: 1 }));
}

function prefs(overrides: Partial<Preferences>): Preferences {
  return {
    priority: "cheapest",
    maxDistanceMeters: 8000,
    maxStores: 1,
    transport: "walk",
    matchMode: "cheapest",
    ...overrides,
  };
}

describe("comparison copy honesty (R7-1)", () => {
  // ALDI is far and prices x,y; LIDL is near and prices x (cheaper) and z.
  const stores = [store("a1", "aldi", 3000), store("l1", "lidl", 200)];
  const offers = offersFrom({ aldi: [100, 100, null], lidl: [50, null, 1000] });

  it.each(["cheapest", "fewest-stores", "balanced"] as const)(
    "under %s, never frames the nearer store's distance as the drawback when item sets differ",
    (priority) => {
      const p = prefs({ priority });
      const result = optimizeBasket({
        items: items("x", "y", "z"),
        stores,
        offers,
        prefs: p,
        config: resolveConfig(p),
        origin: ORIGIN,
      });

      expect(result.recommended?.id).toBe("aldi");
      expect(result.explanation).toContain("isn't directly comparable");
      expect(result.explanation).not.toContain("a shorter trip");
      expect(result.explanation).not.toMatch(/but it's [\d.]+ miles? round trip/);
    }
  );
});

describe("fallback comparison saving (R7-2)", () => {
  it("gives no saving when the comparison store prices fewer items than the recommendation", () => {
    // ALDI prices x and y; TESCO and LIDL price only x (LIDL cheapest on x).
    const p = prefs({ priority: "cheapest" });
    const result = optimizeBasket({
      items: items("x", "y"),
      stores: [store("a1", "aldi", 200), store("t1", "tesco", 300), store("l1", "lidl", 3000)],
      offers: offersFrom({ aldi: [100, 100], tesco: [150, null], lidl: [50, null] }),
      prefs: p,
      config: resolveConfig(p),
      origin: ORIGIN,
    });

    expect(result.recommended?.id).toBe("aldi");
    expect(result.recommended?.savingVsNextBestMinor).toBe(0);
    expect(result.explanation).not.toContain("less on groceries");
  });
});
