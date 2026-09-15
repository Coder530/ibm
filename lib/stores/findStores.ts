import type { StoreDiscoveryResult, StoreLocation } from "@/types/retailers";
import { haversineMeters } from "@/lib/location/geo";
import { queryOverpassStores } from "./overpass";
import { DEFAULT_SNAPSHOT, queryStoreSnapshot, type StoreSnapshot } from "./snapshot";

const CACHE_TTL_MS = 30 * 60 * 1000;

// Query/cache a wider radius than requested, then re-filter per call (see
// filterByExactRadius). Without this, two nearby origins that round to the
// same 2dp cache key but request different radii/positions would either
// miss a cache hit unnecessarily or (worse) silently reuse a discovery that
// doesn't cover their own exact radius.
// Two points sharing a 2dp key can be up to 0.01° apart on each axis: at the
// southern edge of UK bounds (lat 49) that diagonal is ~1.33km (1.11km lat ×
// 0.73km lng), so the padding must exceed it. 1500m covers every UK latitude.
const RADIUS_PADDING_M = 1500;

const MAX_CACHE_ENTRIES = 500;

export class StoreDiscoveryError extends Error {
  code: "stores_unavailable";

  constructor(code: "stores_unavailable", message = "Unable to discover nearby stores.") {
    super(message);
    this.name = "StoreDiscoveryError";
    this.code = code;
  }
}

interface CacheEntry {
  result: StoreDiscoveryResult;
  expiresAt: number;
}

// Module-level cache, keyed by coordinates rounded to 2dp + the PADDED
// radius. TTL 30min. Holds the raw (padded-radius) discovery — never the
// per-call, per-exact-radius, per-exact-origin filtered view — so a
// different origin/radius sharing the same cell can still be re-filtered
// correctly instead of reusing another origin's distances (see
// filterByExactRadius).
const cache = new Map<string, CacheEntry>();

function cacheKey(lat: number, lng: number, paddedRadius: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)},${paddedRadius}`;
}

function getCached(key: string, now: number): StoreDiscoveryResult | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return undefined;
  }
  return entry.result;
}

function setCached(key: string, result: StoreDiscoveryResult, now: number): void {
  cache.set(key, { result, expiresAt: now + CACHE_TTL_MS });
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
}

/**
 * Recomputes every store's distance from the exact call origin — never
 * trusting a cached distanceMeters computed for a different origin that
 * happened to round to the same cache cell — and filters down to the
 * requested (unpadded) radius.
 */
function filterByExactRadius(
  stores: readonly StoreLocation[],
  lat: number,
  lng: number,
  radiusMeters: number
): StoreLocation[] {
  return stores
    .map(
      (store): StoreLocation => ({
        ...store,
        distanceMeters: haversineMeters(lat, lng, store.latitude, store.longitude),
      })
    )
    .filter((store) => store.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id));
}

/** Test-only accessor for the module-level cache bound (MAX_CACHE_ENTRIES). */
export function __storeCacheSizeForTests(): number {
  return cache.size;
}

/**
 * Discovers nearby supermarkets/convenience stores. Tries live Overpass
 * discovery first (freshness 'live'); on failure, falls back to the bundled
 * snapshot within the given radius (freshness 'cached'). Throws
 * StoreDiscoveryError when the snapshot fallback has zero stores within the
 * exact requested radius — a snapshot-sourced empty result is never trusted
 * as a genuine "no stores nearby" answer the way a live one is.
 */
export async function findStores(
  lat: number,
  lng: number,
  radiusMeters: number,
  deps?: {
    overpass?: typeof queryOverpassStores;
    snapshot?: StoreSnapshot;
    now?: () => number;
  }
): Promise<StoreDiscoveryResult> {
  const now = deps?.now ?? Date.now;
  const overpass = deps?.overpass ?? queryOverpassStores;
  const snapshot = deps?.snapshot ?? DEFAULT_SNAPSHOT;

  const paddedRadius = radiusMeters + RADIUS_PADDING_M;
  const key = cacheKey(lat, lng, paddedRadius);
  const nowMs = now();

  let raw = getCached(key, nowMs);

  if (!raw) {
    try {
      const stores = await overpass(lat, lng, paddedRadius);
      raw = {
        stores,
        source: "overpass",
        freshness: "live",
        snapshotDate: null,
        attribution: "© OpenStreetMap contributors, ODbL",
      };
    } catch {
      // Live discovery failed (all mirrors down/timed out) — fall back to
      // the bundled snapshot at the padded radius. Intentional fallback,
      // not a swallowed error: if the re-filtered result below is empty we
      // raise StoreDiscoveryError.
      const snapshotStores = queryStoreSnapshot(lat, lng, paddedRadius, snapshot);
      raw = {
        stores: snapshotStores,
        source: "snapshot",
        freshness: "cached",
        snapshotDate: snapshot.snapshotDate,
        attribution: snapshot.attribution,
      };
    }
    setCached(key, raw, nowMs);
  }

  // On every call — cache hit or miss — recompute distances from THIS
  // call's exact origin and filter to the requested (unpadded) radius.
  const exact = filterByExactRadius(raw.stores, lat, lng, radiusMeters);

  if (raw.source === "snapshot" && exact.length === 0) {
    throw new StoreDiscoveryError("stores_unavailable");
  }

  return { ...raw, stores: exact };
}
