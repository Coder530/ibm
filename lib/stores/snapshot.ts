import type { RetailerId, StoreLocation } from "@/types/retailers";
import { haversineMeters } from "@/lib/location/geo";
import snapshotJson from "@/data/stores/uk-supermarkets.json";

export type StoreSnapshot = {
  snapshotDate: string | null;
  attribution: string;
  rows: [string, RetailerId, number, number, string, string][];
};

/** The bundled fallback snapshot, used when live discovery is unavailable. */
export const DEFAULT_SNAPSHOT: StoreSnapshot = snapshotJson as StoreSnapshot;

/**
 * Queries the bundled OSM snapshot for stores within radiusMeters of a point.
 * Used as a fallback when live Overpass discovery fails (see findStores.ts).
 */
export function queryStoreSnapshot(
  lat: number,
  lng: number,
  radiusMeters: number,
  snapshot: StoreSnapshot = DEFAULT_SNAPSHOT
): StoreLocation[] {
  const results: StoreLocation[] = [];

  for (const [id, retailerId, storeLat, storeLng, name, address] of snapshot.rows) {
    const distanceMeters = haversineMeters(lat, lng, storeLat, storeLng);
    if (distanceMeters <= radiusMeters) {
      results.push({
        id,
        retailerId,
        name,
        latitude: storeLat,
        longitude: storeLng,
        address,
        distanceMeters,
      });
    }
  }

  return results.sort((a, b) => a.distanceMeters - b.distanceMeters);
}
