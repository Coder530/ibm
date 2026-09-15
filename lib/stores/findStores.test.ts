import { describe, expect, it, vi } from "vitest";
import { findStores, StoreDiscoveryError, __storeCacheSizeForTests } from "./findStores";
import type { StoreLocation } from "@/types/retailers";
import type { StoreSnapshot } from "./snapshot";
import { haversineMeters } from "@/lib/location/geo";

// Each test uses distinct coordinates so the module-level 30min TTL cache in
// findStores.ts (keyed by lat/lng/radius) can't leak results between tests.

const EMPTY_SNAPSHOT: StoreSnapshot = {
  snapshotDate: null,
  attribution: "© OpenStreetMap contributors, ODbL",
  rows: [],
};

function makeStore(overrides: Partial<StoreLocation> = {}): StoreLocation {
  return {
    id: "node/1",
    retailerId: "tesco",
    name: "Tesco Superstore",
    latitude: 51.501,
    longitude: -0.1415,
    address: "SW1A 1AA",
    distanceMeters: 100,
    ...overrides,
  };
}

describe("findStores", () => {
  it("returns freshness 'live' when overpass succeeds", async () => {
    const store = makeStore();
    const overpass = vi.fn().mockResolvedValue([store]);
    const result = await findStores(51.501, -0.1415, 1000, {
      overpass,
      snapshot: EMPTY_SNAPSHOT,
      now: () => 1_000_000,
    });

    expect(result.freshness).toBe("live");
    expect(result.source).toBe("overpass");
    expect(result.stores).toHaveLength(1);
    expect(result.stores[0]).toMatchObject({ id: store.id, retailerId: store.retailerId });
  });

  it("returns empty stores (not an error) when overpass succeeds with zero results", async () => {
    const overpass = vi.fn().mockResolvedValue([]);
    const result = await findStores(10, 10, 1000, {
      overpass,
      snapshot: EMPTY_SNAPSHOT,
      now: () => 2_000_000,
    });

    expect(result.freshness).toBe("live");
    expect(result.stores).toEqual([]);
  });

  it("falls back to the snapshot with freshness 'cached' when overpass fails", async () => {
    const snapshotWithRows: StoreSnapshot = {
      snapshotDate: "2026-01-01",
      attribution: "© OpenStreetMap contributors, ODbL",
      rows: [["node/2", "tesco", 52.2, -1.5, "Tesco Superstore", "B1 1AA"]],
    };
    const overpass = vi.fn().mockRejectedValue(new StoreDiscoveryError("stores_unavailable"));
    const result = await findStores(52.2, -1.5, 1000, {
      overpass,
      snapshot: snapshotWithRows,
      now: () => 3_000_000,
    });

    expect(result.freshness).toBe("cached");
    expect(result.source).toBe("snapshot");
    expect(result.snapshotDate).toBe("2026-01-01");
    expect(result.stores).toHaveLength(1);
  });

  it("throws StoreDiscoveryError when overpass fails and the snapshot has nothing nearby", async () => {
    const overpass = vi.fn().mockRejectedValue(new StoreDiscoveryError("stores_unavailable"));

    await expect(
      findStores(53.5, -2.5, 1000, {
        overpass,
        snapshot: EMPTY_SNAPSHOT,
        now: () => 4_000_000,
      })
    ).rejects.toBeInstanceOf(StoreDiscoveryError);
  });

  it("does not call overpass again for the same coordinates within the TTL", async () => {
    const store = makeStore({ latitude: 54.9, longitude: -3.5 });
    const overpass = vi.fn().mockResolvedValue([store]);
    let currentTime = 5_000_000;
    const now = () => currentTime;

    const first = await findStores(54.9, -3.5, 1000, {
      overpass,
      snapshot: EMPTY_SNAPSHOT,
      now,
    });
    currentTime += 60_000; // 1 minute later, well within the 30 minute TTL
    const second = await findStores(54.9, -3.5, 1000, {
      overpass,
      snapshot: EMPTY_SNAPSHOT,
      now,
    });

    expect(overpass).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  // A2 — a shifted origin within the same rounded (2dp) cache cell must get
  // distances recomputed from ITS OWN coordinates, never distances that
  // were computed for a different origin that happened to share a cache key.
  it("recomputes distance from the exact origin on a cache hit from a different origin in the same 2dp cell", async () => {
    const originA: [number, number] = [51.5051, -0.1011];
    const originB: [number, number] = [51.5089, -0.0959];
    expect(originA[0].toFixed(2)).toBe(originB[0].toFixed(2));
    expect(originA[1].toFixed(2)).toBe(originB[1].toFixed(2));

    // ~5.3km from A, ~4.9km from B — inside a 5000m radius for B only.
    const store = makeStore({ id: "node/shift", latitude: 51.507, longitude: -0.0251 });
    const overpass = vi.fn().mockResolvedValue([store]);
    const now = () => 6_000_000;

    await findStores(originA[0], originA[1], 5000, { overpass, snapshot: EMPTY_SNAPSHOT, now });
    const resultB = await findStores(originB[0], originB[1], 5000, {
      overpass,
      snapshot: EMPTY_SNAPSHOT,
      now,
    });

    expect(overpass).toHaveBeenCalledTimes(1); // second call is a cache hit
    expect(resultB.stores).toHaveLength(1);
    const expectedDistanceFromB = haversineMeters(
      originB[0],
      originB[1],
      store.latitude,
      store.longitude
    );
    expect(resultB.stores[0]?.distanceMeters).toBeCloseTo(expectedDistanceFromB, 0);
    expect(Math.abs((resultB.stores[0]?.distanceMeters ?? 0) - expectedDistanceFromB)).toBeLessThan(1);
  });

  // Re-review finding: two origins sharing a 2dp key can be ~1.33km apart
  // (cell diagonal at lat 49), so a 1000m padding let the first caller's live
  // query miss a store that sits inside the second caller's own radius.
  it("padding covers a same-cell origin up to the cell diagonal apart (store found for the second caller)", async () => {
    const originA: [number, number] = [49.005001, 1.005001];
    const originB: [number, number] = [49.014999, 1.014999];
    expect(originA[0].toFixed(2)).toBe(originB[0].toFixed(2));
    expect(originA[1].toFixed(2)).toBe(originB[1].toFixed(2));

    const store = makeStore({ id: "node/diagonal", latitude: 49.017, longitude: 1.018 });
    const radius = 500;
    const fromA = haversineMeters(originA[0], originA[1], store.latitude, store.longitude);
    const fromB = haversineMeters(originB[0], originB[1], store.latitude, store.longitude);
    expect(fromB).toBeLessThanOrEqual(radius); // inside B's own radius
    expect(fromA).toBeGreaterThan(radius + 1000); // beyond the old 1000m padding from A

    // Stub honours the radius it is asked for, like the real Overpass query.
    const overpass = vi.fn((lat: number, lng: number, r: number) =>
      Promise.resolve(
        [store].filter((s) => haversineMeters(lat, lng, s.latitude, s.longitude) <= r)
      )
    );
    const now = () => 8_000_000;

    await findStores(originA[0], originA[1], radius, { overpass, snapshot: EMPTY_SNAPSHOT, now });
    const resultB = await findStores(originB[0], originB[1], radius, {
      overpass,
      snapshot: EMPTY_SNAPSHOT,
      now,
    });

    expect(overpass).toHaveBeenCalledTimes(1); // B is served from A's cached, padded discovery
    expect(resultB.stores.map((s) => s.id)).toEqual(["node/diagonal"]);
  });

  it("never exceeds 500 cache entries after 600 distinct keys", async () => {
    const overpass = vi.fn().mockResolvedValue([]);
    for (let i = 0; i < 600; i++) {
      // Spread far apart so every call gets a distinct 2dp cache key.
      const lat = 0 + i * 0.05;
      const lng = 0 + i * 0.05;
      await findStores(lat, lng, 1000, { overpass, snapshot: EMPTY_SNAPSHOT, now: () => 7_000_000 });
    }

    expect(__storeCacheSizeForTests()).toBeLessThanOrEqual(500);
  });
});
