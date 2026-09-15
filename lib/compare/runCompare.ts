import type { z } from "zod";
import type { RetailerId, Freshness } from "@/types/retailers";
import { RETAILERS } from "@/types/retailers";
import type { CompareEvent } from "@/types/api";
import type { ProductOffer, RetailerAdapter } from "@/types/products";
import type { OptimizationResult, OptimizerInput } from "@/types/optimization";
import { compareRequestSchema } from "@/lib/validation/schemas";
import { findStores as defaultFindStores, StoreDiscoveryError } from "@/lib/stores/findStores";
import { ADAPTERS as defaultAdapters } from "@/lib/retailers/registry";
import { optimizeBasket as defaultOptimizeBasket } from "@/lib/optimization/engine";
import { resolveConfig as defaultResolveConfig } from "@/lib/optimization/config";

export type CompareRequest = z.infer<typeof compareRequestSchema>;

interface RunCompareDeps {
  findStores?: typeof defaultFindStores;
  adapters?: Record<RetailerId, RetailerAdapter>;
  optimize?: typeof defaultOptimizeBasket;
  config?: typeof defaultResolveConfig;
  adapterTimeoutMs?: number;
}

const DEFAULT_ADAPTER_TIMEOUT_MS = 8000;

/** Races `promise` against a timeout that rejects after `timeoutMs`, so one
 * slow/hung retailer adapter can't block the whole compare run. */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const FRESHNESS_RANK: Record<Freshness, number> = { live: 0, cached: 1, demo: 2 };

// Worst (least fresh) freshness present across every offer actually
// returned, live < cached < demo. Falls back to 'demo' when there are no
// offers at all — this system never fabricates a 'live' claim by default.
function worstFreshness(offers: OptimizerInput["offers"]): Freshness {
  let worst: Freshness | null = null;
  for (const byItem of Object.values(offers)) {
    if (!byItem) continue;
    for (const offer of Object.values(byItem)) {
      if (!offer) continue;
      if (worst === null || FRESHNESS_RANK[offer.freshness] > FRESHNESS_RANK[worst]) {
        worst = offer.freshness;
      }
    }
  }
  return worst ?? "demo";
}

type Settled<K extends string, T> =
  | { key: K; ok: true; value: T }
  | { key: K; ok: false; error: unknown };

// Runs every job in parallel and yields results as each settles (not once
// all are done), via a small pending-promise queue raced repeatedly.
async function* settleAsCompleted<K extends string, T>(
  jobs: readonly { key: K; promise: Promise<T> }[]
): AsyncGenerator<Settled<K, T>> {
  const pending = new Map<number, Promise<Settled<K, T>>>(
    jobs.map(({ key, promise }, index) => [
      index,
      promise.then(
        (value): Settled<K, T> => ({ key, ok: true, value }),
        (error): Settled<K, T> => ({ key, ok: false, error })
      ),
    ])
  );

  while (pending.size > 0) {
    const [winnerIndex, winnerResult] = await Promise.race(
      Array.from(pending, async ([index, wrapped]) => [index, await wrapped] as const)
    );
    pending.delete(winnerIndex);
    yield winnerResult;
  }
}

/**
 * Runs one compare request end-to-end — store discovery, parallel retailer
 * pricing, then basket optimization — yielding CompareEvents as each stage
 * completes so the API route can stream them.
 *
 * P5: coordinates arrive only via `req` and are never logged (any logging
 * here is generic, error-only, and coordinate-free).
 * P6: this is the sole server-side entry point that touches store discovery
 * and retailer adapters — never call them directly from client code.
 */
export async function* runCompare(
  req: CompareRequest,
  deps?: RunCompareDeps
): AsyncGenerator<CompareEvent> {
  const findStoresImpl = deps?.findStores ?? defaultFindStores;
  const adapters = deps?.adapters ?? defaultAdapters;
  const optimize = deps?.optimize ?? defaultOptimizeBasket;
  const resolveConfigImpl = deps?.config ?? defaultResolveConfig;
  const adapterTimeoutMs = deps?.adapterTimeoutMs ?? DEFAULT_ADAPTER_TIMEOUT_MS;

  try {
    let discovery;
    try {
      discovery = await findStoresImpl(req.latitude, req.longitude, req.prefs.maxDistanceMeters);
    } catch (err) {
      if (err instanceof StoreDiscoveryError) {
        yield {
          type: "error",
          code: "stores_unavailable",
          message: "Unable to discover nearby stores. Please try again shortly.",
        };
        return;
      }
      throw err;
    }

    if (discovery.stores.length === 0) {
      yield { type: "error", code: "no_stores", message: "No stores found within range." };
      return;
    }

    yield { type: "stores", discovery };

    // Retailers to query = those with >=1 discovered store, ordered by the
    // distance of their nearest store. Ocado has no physical stores and is
    // never queried or emitted for.
    const nearest = new Map<RetailerId, number>();
    for (const store of discovery.stores) {
      const current = nearest.get(store.retailerId);
      if (current === undefined || store.distanceMeters < current) {
        nearest.set(store.retailerId, store.distanceMeters);
      }
    }
    const retailerIds = Array.from(nearest.keys())
      .filter((id) => id !== "ocado")
      .sort((a, b) => (nearest.get(a) ?? 0) - (nearest.get(b) ?? 0));

    for (const retailerId of retailerIds) {
      yield { type: "retailer", retailerId, status: "searching", matched: 0, total: req.items.length };
    }

    const offers: Partial<Record<RetailerId, Record<string, ProductOffer | null>>> = {};
    const failedRetailerIds: RetailerId[] = [];

    const jobs = retailerIds.map((retailerId) => ({
      key: retailerId,
      promise: withTimeout(
        adapters[retailerId].findOffers(req.items, { mode: req.prefs.matchMode }),
        adapterTimeoutMs,
        `retailer ${retailerId} timed out after ${adapterTimeoutMs}ms`
      ),
    }));

    for await (const settled of settleAsCompleted(jobs)) {
      if (settled.ok) {
        const byItem: Record<string, ProductOffer | null> = {};
        let matched = 0;
        for (const [itemId, offer] of settled.value) {
          byItem[itemId] = offer;
          if (offer) matched += 1;
        }
        offers[settled.key] = byItem;
        yield {
          type: "retailer",
          retailerId: settled.key,
          status: "done",
          matched,
          total: req.items.length,
        };
      } else {
        console.error(`runCompare: retailer ${settled.key} failed`, settled.error);
        failedRetailerIds.push(settled.key);
        yield {
          type: "retailer",
          retailerId: settled.key,
          status: "error",
          matched: 0,
          total: req.items.length,
        };
      }
    }

    // Every retailer failing is an outage, not an absence of stores (P3): the
    // engine would otherwise drop them all and report "no supported stores".
    if (retailerIds.length > 0 && failedRetailerIds.length === retailerIds.length) {
      yield {
        type: "error",
        code: "pricing_unavailable",
        message:
          "We found stores near you but couldn't get prices from any retailer just now. Please try again in a moment.",
      };
      return;
    }

    const config = resolveConfigImpl(req.prefs);
    const optimized: OptimizationResult = optimize({
      items: req.items,
      stores: discovery.stores,
      offers,
      prefs: req.prefs,
      config,
      origin: { latitude: req.latitude, longitude: req.longitude },
      unreachableRetailerIds: [...failedRetailerIds],
    });

    // A retailer that errored or timed out is absent from `offers`, so the
    // engine can't tell it apart from "doesn't stock it". Say so explicitly
    // (P3: never let missing data read as a genuine absence).
    const result: OptimizationResult =
      failedRetailerIds.length === 0
        ? optimized
        : {
            ...optimized,
            warnings: [
              `Couldn't get prices from ${failedRetailerIds
                .map((id) => RETAILERS[id].name)
                .join(", ")} just now, so their nearby stores aren't included in this comparison.`,
              ...optimized.warnings,
            ],
          };

    yield { type: "result", result, offersFreshness: worstFreshness(offers) };
  } catch (err) {
    console.error("runCompare: unexpected failure", err);
    yield {
      type: "error",
      code: "internal",
      message: "Something went wrong comparing prices. Please try again.",
    };
  }
}
