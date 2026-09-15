import { describe, expect, it } from "vitest";
import { queryStoreSnapshot, type StoreSnapshot } from "./snapshot";

const SNAPSHOT: StoreSnapshot = {
  snapshotDate: "2026-01-01",
  attribution: "© OpenStreetMap contributors, ODbL",
  rows: [
    ["node/1", "tesco", 51.501, -0.1415, "Tesco Superstore", "SW1A 1AA"],
    ["node/2", "sainsburys", 52.5, -1.9, "Sainsbury's", "B1 1AA"],
  ],
};

describe("queryStoreSnapshot", () => {
  it("returns rows within the radius, sorted by distance", () => {
    const stores = queryStoreSnapshot(51.501, -0.1415, 1000, SNAPSHOT);
    expect(stores).toHaveLength(1);
    expect(stores[0]?.id).toBe("node/1");
    expect(stores[0]?.retailerId).toBe("tesco");
    expect(stores[0]?.address).toBe("SW1A 1AA");
  });

  it("returns an empty array when nothing is within radius", () => {
    const stores = queryStoreSnapshot(0, 0, 1000, SNAPSHOT);
    expect(stores).toEqual([]);
  });
});
