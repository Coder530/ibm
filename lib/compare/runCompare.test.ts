import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { RetailerId, StoreDiscoveryResult, StoreLocation } from "@/types/retailers";
import type { RetailerAdapter, ProductOffer } from "@/types/products";
import type { OptimizationResult, Preferences } from "@/types/optimization";
import type { CompareEvent } from "@/types/api";
import { StoreDiscoveryError } from "@/lib/stores/findStores";

// runCompare.ts statically imports these — they don't exist yet (Builder B's
// files), so this whole test file mocks them purely to let the module under
// test load. Every test below overrides optimize/config/findStores/adapters
// via runCompare's deps parameter, so the mock factories' behaviour is
// otherwise irrelevant.
vi.mock("@/lib/optimization/engine", () => ({ optimizeBasket: vi.fn() }));
vi.mock("@/lib/optimization/config", () => ({
  DEFAULT_OPTIMIZER_CONFIG: {},
  resolveConfig: vi.fn(),
}));

const { runCompare } = await import("./runCompare");

const PREFS: Preferences = {
  priority: "cheapest",
  maxDistanceMeters: 2000,
  maxStores: 2,
  transport: "walk",
  matchMode: "cheapest",
};

function makeStore(overrides: Partial<StoreLocation> = {}): StoreLocation {
  return {
    id: "s1",
    retailerId: "tesco",
    name: "Tesco Express",
    latitude: 51.5,
    longitude: -0.12,
    address: "1 High St",
    distanceMeters: 200,
    ...overrides,
  };
}

function makeDiscovery(stores: StoreLocation[]): StoreDiscoveryResult {
  return {
    stores,
    source: "overpass",
    freshness: "live",
    snapshotDate: null,
    attribution: "© OpenStreetMap contributors, ODbL",
  };
}

function makeAdapter(
  retailerId: RetailerId,
  impl: () => Promise<Map<string, ProductOffer | null>>
): RetailerAdapter {
  return {
    retailer: { id: retailerId, name: retailerId, color: "#000000" },
    findOffers: impl,
  };
}

function makeOffer(retailerId: RetailerId): ProductOffer {
  return {
    retailerId,
    productId: `${retailerId}:milk-semi`,
    productName: "Milk",
    priceMinor: 100,
    currency: "GBP",
    availability: "available",
    confidence: 1,
    freshness: "demo",
    source: "demo-catalog",
    isOwnBrand: true,
  };
}

const FAKE_RESULT: OptimizationResult = {
  recommended: null,
  alternatives: [],
  explanation: "",
  warnings: [],
};

const REQUEST = {
  latitude: 51.5,
  longitude: -0.12,
  items: [{ id: "i1", name: "milk", quantity: 1 }],
  prefs: PREFS,
};

async function collect(gen: AsyncGenerator<CompareEvent>): Promise<CompareEvent[]> {
  const events: CompareEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

describe("runCompare", () => {
  it("emits stores -> retailer searching -> retailer done -> result, in order", async () => {
    const findStores = vi.fn().mockResolvedValue(makeDiscovery([makeStore()]));
    const adapters = {
      tesco: makeAdapter("tesco", async () => new Map([["i1", makeOffer("tesco")]])),
    } as Record<RetailerId, RetailerAdapter>;
    const optimize = vi.fn().mockReturnValue(FAKE_RESULT);
    const config = vi.fn().mockReturnValue({});

    const events = await collect(runCompare(REQUEST, { findStores, adapters, optimize, config }));

    expect(events[0]?.type).toBe("stores");
    expect(events[1]).toMatchObject({ type: "retailer", retailerId: "tesco", status: "searching" });
    expect(events[2]).toMatchObject({
      type: "retailer",
      retailerId: "tesco",
      status: "done",
      matched: 1,
    });
    expect(events.at(-1)).toMatchObject({ type: "result", offersFreshness: "demo" });
    expect(optimize).toHaveBeenCalledTimes(1);
  });

  it("emits a single stores_unavailable error when store discovery throws StoreDiscoveryError", async () => {
    const findStores = vi.fn().mockRejectedValue(new StoreDiscoveryError("stores_unavailable"));

    const events = await collect(
      runCompare(REQUEST, {
        findStores,
        adapters: {} as Record<RetailerId, RetailerAdapter>,
        optimize: vi.fn(),
        config: vi.fn(),
      })
    );

    expect(events).toEqual([
      { type: "error", code: "stores_unavailable", message: expect.any(String) },
    ]);
  });

  it("emits no_stores when discovery returns zero stores", async () => {
    const findStores = vi.fn().mockResolvedValue(makeDiscovery([]));

    const events = await collect(
      runCompare(REQUEST, {
        findStores,
        adapters: {} as Record<RetailerId, RetailerAdapter>,
        optimize: vi.fn(),
        config: vi.fn(),
      })
    );

    expect(events).toEqual([{ type: "error", code: "no_stores", message: expect.any(String) }]);
  });

  it("still emits a result when one retailer adapter rejects", async () => {
    const findStores = vi.fn().mockResolvedValue(
      makeDiscovery([makeStore(), makeStore({ id: "s2", retailerId: "asda", distanceMeters: 300 })])
    );
    const adapters = {
      tesco: makeAdapter("tesco", async () => new Map([["i1", makeOffer("tesco")]])),
      asda: makeAdapter("asda", async () => {
        throw new Error("boom");
      }),
    } as Record<RetailerId, RetailerAdapter>;
    const optimize = vi.fn().mockReturnValue(FAKE_RESULT);
    const config = vi.fn().mockReturnValue({});

    const events = await collect(runCompare(REQUEST, { findStores, adapters, optimize, config }));

    const asdaError = events.find(
      (e) => e.type === "retailer" && e.retailerId === "asda" && e.status === "error"
    );
    expect(asdaError).toBeDefined();
    expect(events.at(-1)?.type).toBe("result");
  });

  it("F-11: names failed retailers in the result warnings so missing data never reads as 'not stocked'", async () => {
    const findStores = vi.fn().mockResolvedValue(
      makeDiscovery([makeStore(), makeStore({ id: "s2", retailerId: "asda", distanceMeters: 300 })])
    );
    const adapters = {
      tesco: makeAdapter("tesco", async () => new Map([["i1", makeOffer("tesco")]])),
      asda: makeAdapter("asda", async () => {
        throw new Error("boom");
      }),
    } as Record<RetailerId, RetailerAdapter>;
    const optimize = vi
      .fn()
      .mockReturnValue({ ...FAKE_RESULT, warnings: ["engine warning"] });
    const config = vi.fn().mockReturnValue({});

    const events = await collect(runCompare(REQUEST, { findStores, adapters, optimize, config }));

    const last = events.at(-1);
    expect(last?.type).toBe("result");
    if (last?.type !== "result") return;
    expect(last.result.warnings[0]).toContain("Asda");
    expect(last.result.warnings[0]).not.toContain("Tesco");
    expect(last.result.warnings).toContain("engine warning");
  });

  it("L6: passes failed retailer ids to the optimizer as unreachableRetailerIds", async () => {
    const findStores = vi.fn().mockResolvedValue(
      makeDiscovery([makeStore(), makeStore({ id: "s2", retailerId: "asda", distanceMeters: 300 })])
    );
    const adapters = {
      tesco: makeAdapter("tesco", async () => new Map([["i1", makeOffer("tesco")]])),
      asda: makeAdapter("asda", async () => {
        throw new Error("boom");
      }),
    } as Record<RetailerId, RetailerAdapter>;
    const optimize = vi.fn().mockReturnValue(FAKE_RESULT);
    const config = vi.fn().mockReturnValue({});

    await collect(runCompare(REQUEST, { findStores, adapters, optimize, config }));

    expect(optimize).toHaveBeenCalledTimes(1);
    expect(optimize.mock.calls[0]?.[0]).toMatchObject({ unreachableRetailerIds: ["asda"] });
  });

  it("L6: passes an empty unreachableRetailerIds when every adapter succeeds", async () => {
    const findStores = vi.fn().mockResolvedValue(makeDiscovery([makeStore()]));
    const adapters = {
      tesco: makeAdapter("tesco", async () => new Map([["i1", makeOffer("tesco")]])),
    } as Record<RetailerId, RetailerAdapter>;
    const optimize = vi.fn().mockReturnValue(FAKE_RESULT);
    const config = vi.fn().mockReturnValue({});

    await collect(runCompare(REQUEST, { findStores, adapters, optimize, config }));

    expect(optimize.mock.calls[0]?.[0]).toMatchObject({ unreachableRetailerIds: [] });
  });

  it("F-11: adds no retailer warning when every adapter succeeds", async () => {
    const findStores = vi.fn().mockResolvedValue(makeDiscovery([makeStore()]));
    const adapters = {
      tesco: makeAdapter("tesco", async () => new Map([["i1", makeOffer("tesco")]])),
    } as Record<RetailerId, RetailerAdapter>;
    const optimize = vi.fn().mockReturnValue(FAKE_RESULT);
    const config = vi.fn().mockReturnValue({});

    const events = await collect(runCompare(REQUEST, { findStores, adapters, optimize, config }));

    const last = events.at(-1);
    expect(last?.type === "result" && last.result.warnings).toEqual([]);
  });

  it("does not query a retailer with no discovered store", async () => {
    const findStores = vi.fn().mockResolvedValue(makeDiscovery([makeStore()])); // tesco only
    const asdaFindOffers = vi.fn();
    const adapters = {
      tesco: makeAdapter("tesco", async () => new Map()),
      asda: makeAdapter("asda", asdaFindOffers),
    } as Record<RetailerId, RetailerAdapter>;
    const optimize = vi.fn().mockReturnValue(FAKE_RESULT);
    const config = vi.fn().mockReturnValue({});

    const events = await collect(runCompare(REQUEST, { findStores, adapters, optimize, config }));

    expect(asdaFindOffers).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === "retailer" && e.retailerId === "asda")).toBe(false);
  });

  it("A5: times out a hung adapter, emits its retailer as error, and still emits result", async () => {
    const findStores = vi.fn().mockResolvedValue(
      makeDiscovery([makeStore(), makeStore({ id: "s2", retailerId: "asda", distanceMeters: 300 })])
    );
    const adapters = {
      tesco: makeAdapter("tesco", async () => new Map([["i1", makeOffer("tesco")]])),
      asda: makeAdapter("asda", () => new Promise<Map<string, ProductOffer | null>>(() => {})), // never resolves
    } as Record<RetailerId, RetailerAdapter>;
    const optimize = vi.fn().mockReturnValue(FAKE_RESULT);
    const config = vi.fn().mockReturnValue({});

    const events = await collect(
      runCompare(REQUEST, { findStores, adapters, optimize, config, adapterTimeoutMs: 20 })
    );

    const asdaError = events.find(
      (e) => e.type === "retailer" && e.retailerId === "asda" && e.status === "error"
    );
    expect(asdaError).toBeDefined();
    expect(events.at(-1)?.type).toBe("result");
  });

  it("R3-6: every retailer failing or timing out ends in pricing_unavailable, never 'no stores', and skips the optimizer", async () => {
    const findStores = vi.fn().mockResolvedValue(
      makeDiscovery([makeStore(), makeStore({ id: "s2", retailerId: "asda", distanceMeters: 300 })])
    );
    const adapters = {
      tesco: makeAdapter("tesco", async () => {
        throw new Error("boom");
      }),
      asda: makeAdapter("asda", () => new Promise<Map<string, ProductOffer | null>>(() => {})), // never resolves
    } as Record<RetailerId, RetailerAdapter>;
    const optimize = vi.fn().mockReturnValue(FAKE_RESULT);
    const config = vi.fn().mockReturnValue({});

    const events = await collect(
      runCompare(REQUEST, { findStores, adapters, optimize, config, adapterTimeoutMs: 20 })
    );

    expect(events.filter((e) => e.type === "retailer" && e.status === "error")).toHaveLength(2);
    expect(events.some((e) => e.type === "result")).toBe(false);
    expect(events.at(-1)).toEqual({
      type: "error",
      code: "pricing_unavailable",
      message:
        "We found stores near you but couldn't get prices from any retailer just now. Please try again in a moment.",
    });
    expect(optimize).not.toHaveBeenCalled();
  });

  it("never queries or emits for ocado, even if it somehow has a discovered store", async () => {
    const findStores = vi
      .fn()
      .mockResolvedValue(makeDiscovery([makeStore(), makeStore({ id: "s2", retailerId: "ocado" })]));
    const ocadoFindOffers = vi.fn();
    const adapters = {
      tesco: makeAdapter("tesco", async () => new Map()),
      ocado: makeAdapter("ocado", ocadoFindOffers),
    } as Record<RetailerId, RetailerAdapter>;
    const optimize = vi.fn().mockReturnValue(FAKE_RESULT);
    const config = vi.fn().mockReturnValue({});

    const events = await collect(runCompare(REQUEST, { findStores, adapters, optimize, config }));

    expect(ocadoFindOffers).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === "retailer" && e.retailerId === "ocado")).toBe(false);
  });
});
