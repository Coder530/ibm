import { describe, expect, it } from "vitest";
import { haversineMeters } from "@/lib/location/geo";
import { RETAILER_IDS, type RetailerId, type StoreLocation } from "@/types/retailers";
import { SIZE, YOU_LABEL_ABOVE_OFFSET_Y, YOU_LABEL_OFFSET_Y, plotRadiusFor, selectRadarPoints } from "./radarPoints";

const ORIGIN = { latitude: 51.5074, longitude: -0.1278 }; // central London
const RADIUS_METERS = 8046.72; // 5 miles

/** Inverse of haversineMeters/bearingDegrees — places a point at an exact bearing/distance from `origin`. */
function destinationPoint(
  origin: { latitude: number; longitude: number },
  bearingDeg: number,
  distanceMeters: number
): { latitude: number; longitude: number } {
  const R = 6371000;
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (origin.latitude * Math.PI) / 180;
  const lng1 = (origin.longitude * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceMeters / R) +
      Math.cos(lat1) * Math.sin(distanceMeters / R) * Math.cos(brng)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(distanceMeters / R) * Math.cos(lat1),
      Math.cos(distanceMeters / R) - Math.sin(lat1) * Math.sin(lat2)
    );
  return { latitude: (lat2 * 180) / Math.PI, longitude: (lng2 * 180) / Math.PI };
}

let storeSeq = 0;
function makeStore(retailerId: RetailerId, bearingDeg: number, distanceMeters: number): StoreLocation {
  storeSeq += 1;
  const { latitude, longitude } = destinationPoint(ORIGIN, bearingDeg, distanceMeters);
  return {
    id: `store-${storeSeq}`,
    retailerId,
    name: `${retailerId}-${storeSeq}`,
    latitude,
    longitude,
    address: "1 Test Street, London",
    distanceMeters,
  };
}

// SPEC F5 / V1's observed scenario: 664 stores across 10 retailers within a
// 5-mile central-London radius. Ten "anchor" stores (one per retailer) are
// guaranteed to be the nearest of their retailer and are laid out so their
// label BOXES never overlap (labels are text-width aware); everything else is
// dense "noise" further out, some inside the radius and some outside it.
const TEN_RETAILERS = RETAILER_IDS.slice(0, 10);

function buildDenseFixture(): {
  stores: StoreLocation[];
  anchors: StoreLocation[];
  recommended: StoreLocation;
} {
  storeSeq = 0;
  const stores: StoreLocation[] = [];

  // Anchors alternate between two rings (2000m → ~55 units, 5500m → ~91 units
  // on the square-root scale) at 36-degree bearings, so neighbouring labels sit
  // on different rings and same-ring neighbours are 72 degrees apart.
  const anchors = TEN_RETAILERS.map((retailerId, i) => makeStore(retailerId, i * 36, i % 2 === 0 ? 2000 : 5500));
  stores.push(...anchors);

  // Recommended store: tesco, but not tesco's nearest, placed between the
  // waitrose (216°) and co-op (252°) anchors on an outer ring so its label box
  // clears every anchor's.
  const recommended = makeStore("tesco", 234, 7500);
  stores.push(recommended);

  let i = 0;
  while (stores.length < 664) {
    const retailerId = TEN_RETAILERS[i % TEN_RETAILERS.length]!;
    const bearing = (i * 7) % 360;
    // Always further out than any anchor (max 5500m) so anchors stay each
    // retailer's nearest store; 5600m..14100m straddles the 8046.72m radius.
    const distance = 5600 + (i % 86) * 100;
    stores.push(makeStore(retailerId, bearing, distance));
    i += 1;
  }

  return { stores, anchors, recommended };
}

describe("selectRadarPoints", () => {
  it("caps labelled points at 12 for a dense 664-store, 10-retailer fixture", () => {
    const { stores } = buildDenseFixture();
    expect(stores).toHaveLength(664);

    const { labelled } = selectRadarPoints(ORIGIN, stores, RADIUS_METERS, []);
    expect(labelled.length).toBeLessThanOrEqual(12);
  });

  it("labels exactly the nearest store of each retailer plus the recommended store", () => {
    const { stores, anchors, recommended } = buildDenseFixture();
    const { labelled } = selectRadarPoints(ORIGIN, stores, RADIUS_METERS, [recommended.id]);
    const labelledIds = new Set(labelled.map((p) => p.store.id));

    for (const anchor of anchors) {
      expect(labelledIds.has(anchor.id)).toBe(true);
    }
    expect(labelledIds.has(recommended.id)).toBe(true);
    expect(labelled.length).toBe(anchors.length + 1);
  });

  it("caps background points at the default of 80", () => {
    const { stores, recommended } = buildDenseFixture();
    const { background } = selectRadarPoints(ORIGIN, stores, RADIUS_METERS, [recommended.id]);
    expect(background.length).toBeLessThanOrEqual(80);
    expect(background.length).toBe(80); // the dense fixture has well over 80 candidates
  });

  it("never drops a recommended store from labelled, even under a tight cap", () => {
    const { stores, recommended } = buildDenseFixture();
    const { labelled } = selectRadarPoints(ORIGIN, stores, RADIUS_METERS, [recommended.id], { maxLabelled: 1 });
    expect(labelled.some((p) => p.store.id === recommended.id)).toBe(true);
  });

  it("excludes stores outside the radius from both labelled and background", () => {
    const { stores } = buildDenseFixture();
    const result = selectRadarPoints(ORIGIN, stores, RADIUS_METERS, []);

    for (const point of [...result.labelled, ...result.background]) {
      const distance = haversineMeters(ORIGIN.latitude, ORIGIN.longitude, point.store.latitude, point.store.longitude);
      expect(distance).toBeLessThanOrEqual(RADIUS_METERS);
    }

    const withinRadius = stores.filter(
      (s) => haversineMeters(ORIGIN.latitude, ORIGIN.longitude, s.latitude, s.longitude) <= RADIUS_METERS
    );
    expect(result.totalStores).toBe(withinRadius.length);
    expect(withinRadius.length).toBeLessThan(stores.length); // fixture does include out-of-radius stores
  });

  it("is deterministic for the same input", () => {
    const { stores, recommended } = buildDenseFixture();
    const first = selectRadarPoints(ORIGIN, stores, RADIUS_METERS, [recommended.id]);
    const second = selectRadarPoints(ORIGIN, stores, RADIUS_METERS, [recommended.id]);

    expect(first.labelled.map((p) => p.store.id)).toEqual(second.labelled.map((p) => p.store.id));
    expect(first.background.map((p) => p.store.id)).toEqual(second.background.map((p) => p.store.id));
    expect(first.totalStores).toBe(second.totalStores);
  });

  it("skips a non-recommended label that collides with an already-placed label, but never skips a recommended one", () => {
    // Two different-retailer stores at (nearly) the same bearing/distance so
    // their labels fall well within the 14-unit collision radius.
    const a = makeStore("tesco", 45, 3000); // recommended — placed first, never skipped
    const b = makeStore("aldi", 45.2, 3000); // collides with a's label

    const { labelled, background } = selectRadarPoints(ORIGIN, [a, b], RADIUS_METERS, [a.id]);

    expect(labelled.some((p) => p.store.id === a.id)).toBe(true);
    expect(labelled.some((p) => p.store.id === b.id)).toBe(false);
    // b is still plotted as an unlabelled dot, not dropped from the radar entirely.
    expect(background.some((p) => p.store.id === b.id)).toBe(true);
  });

  it("plots distance on a square-root scale, clamped to the radius", () => {
    const full = plotRadiusFor(RADIUS_METERS, RADIUS_METERS);
    expect(plotRadiusFor(0, RADIUS_METERS)).toBe(0);
    expect(plotRadiusFor(RADIUS_METERS / 4, RADIUS_METERS)).toBeCloseTo(full / 2, 6);
    expect(plotRadiusFor(RADIUS_METERS * 2, RADIUS_METERS)).toBe(full);
    expect(plotRadiusFor(1000, RADIUS_METERS)).toBeLessThan(plotRadiusFor(2000, RADIUS_METERS));
    expect(plotRadiusFor(500, 0)).toBe(0);
  });

  it("skips a label whose text box overlaps a placed label even when the blips are more than 14 units apart", () => {
    // Sainsbury's (wide label) placed first; Morrisons 20 degrees round and a
    // little further out: blips ~23 units apart, but the text boxes overlap.
    const wide = makeStore("sainsburys", 0, 3000);
    const neighbour = makeStore("morrisons", 20, 3100);

    const { labelled, background } = selectRadarPoints(ORIGIN, [wide, neighbour], RADIUS_METERS, []);

    expect(labelled.map((p) => p.store.id)).toEqual([wide.id]);
    expect(background.some((p) => p.store.id === neighbour.id)).toBe(true);
  });

  it("skips a non-recommended label that would overlap the YOU label", () => {
    // Due south at ~450m puts the label baseline right on top of "YOU".
    const underYou = makeStore("aldi", 180, 450);

    const { labelled, background } = selectRadarPoints(ORIGIN, [underYou], RADIUS_METERS, []);

    expect(labelled).toHaveLength(0);
    expect(background.some((p) => p.store.id === underYou.id)).toBe(true);
  });

  it("keeps the YOU label below the centre when nothing covers it", () => {
    const far = makeStore("tesco", 90, 4000);
    const { youLabelY } = selectRadarPoints(ORIGIN, [far], RADIUS_METERS, [far.id]);
    expect(youLabelY).toBe(SIZE / 2 + YOU_LABEL_OFFSET_Y);
  });

  it("moves the YOU label above the centre when a recommended label would cover it", () => {
    // Recommended store due south at ~450m: its label baseline lands on the default "YOU" position.
    const nextDoor = makeStore("morrisons", 180, 450);
    const { youLabelY, labelled } = selectRadarPoints(ORIGIN, [nextDoor], RADIUS_METERS, [nextDoor.id]);
    expect(labelled.map((p) => p.store.id)).toEqual([nextDoor.id]);
    expect(youLabelY).toBe(SIZE / 2 - YOU_LABEL_ABOVE_OFFSET_Y);
  });

  it("keeps every retailer's nearest store in nearestPerRetailer even when its label is skipped (text alternative)", () => {
    const wide = makeStore("sainsburys", 0, 3000);
    const neighbour = makeStore("morrisons", 20, 3100);
    const fartherSameRetailer = makeStore("morrisons", 90, 6000);

    const { labelled, nearestPerRetailer } = selectRadarPoints(
      ORIGIN,
      [wide, neighbour, fartherSameRetailer],
      RADIUS_METERS,
      []
    );

    expect(labelled.some((p) => p.store.id === neighbour.id)).toBe(false);
    expect(nearestPerRetailer.map((p) => p.store.id)).toEqual([wide.id, neighbour.id]);
  });
});
