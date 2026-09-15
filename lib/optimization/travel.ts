import type { OptimizerConfig, Transport } from "@/types/optimization";
import type { StoreLocation } from "@/types/retailers";
import { haversineMeters } from "@/lib/location/geo";

type Point = { latitude: number; longitude: number };

/** Straight-line distance is inflated to approximate real road/footpath distance. */
export const ROAD_FACTOR = 1.3;
/** Flat bus fare charged once per shopping trip (not per leg). */
export const BUS_FARE_PER_TRIP_MINOR = 200;

function legMeters(a: Point, b: Point): number {
  return haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
}

/** Nearest-neighbour visiting order from `origin`; ties broken by store id. */
export function routeStores(origin: Point, stores: readonly StoreLocation[]): StoreLocation[] {
  const remaining = [...stores];
  const route: StoreLocation[] = [];
  let current: Point = origin;
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((store, i) => {
      const d = legMeters(current, store);
      const incumbent = remaining[bestIndex];
      if (
        d < bestDistance ||
        (d === bestDistance && incumbent !== undefined && store.id < incumbent.id)
      ) {
        bestDistance = d;
        bestIndex = i;
      }
    });
    const [next] = remaining.splice(bestIndex, 1);
    if (next === undefined) break;
    route.push(next);
    current = next;
  }
  return route;
}

/**
 * Round-trip travel for origin → s1 → … → sn → origin. All outputs are integers:
 * metres, minutes, and pence (distance cost + value of time + bus fare).
 */
export function travelFor(
  origin: Point,
  orderedStores: readonly StoreLocation[],
  transport: Transport,
  cfg: OptimizerConfig
): { distanceMeters: number; minutes: number; costMinor: number } {
  if (orderedStores.length === 0) {
    return { distanceMeters: 0, minutes: 0, costMinor: 0 };
  }
  let straight = 0;
  let current: Point = origin;
  for (const store of orderedStores) {
    straight += legMeters(current, store);
    current = store;
  }
  straight += legMeters(current, origin);

  const mode = cfg.transport[transport];
  const distanceMeters = Math.round(straight * ROAD_FACTOR);
  const km = distanceMeters / 1000;
  const minutes = Math.round((km / mode.speedKmh) * 60);
  const fare = transport === "bus" ? BUS_FARE_PER_TRIP_MINOR : 0;
  const costMinor =
    Math.round(km * mode.costPerKmMinor) + Math.round(minutes * mode.valuePerMinuteMinor) + fare;
  return { distanceMeters, minutes, costMinor };
}
