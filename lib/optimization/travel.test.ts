import { describe, expect, it } from "vitest";
import type { OptimizerConfig } from "@/types/optimization";
import type { StoreLocation } from "@/types/retailers";
import { DEFAULT_OPTIMIZER_CONFIG } from "./config";
import { BUS_FARE_PER_TRIP_MINOR, routeStores, travelFor } from "./travel";

const origin = { latitude: 51.5, longitude: -0.1 };

function store(id: string, dLat: number, dLng: number): StoreLocation {
  return {
    id,
    retailerId: "tesco",
    name: id,
    latitude: origin.latitude + dLat,
    longitude: origin.longitude + dLng,
    address: "",
    distanceMeters: 0,
  };
}

const near = store("near", 0.005, 0);
const mid = store("mid", 0.01, 0);
const far = store("far", 0.03, 0);

describe("routeStores", () => {
  it("orders stores by nearest neighbour from the origin", () => {
    // Nearest from origin is `near`; from there `mid`, then `far`.
    expect(routeStores(origin, [far, mid, near]).map((s) => s.id)).toEqual(["near", "mid", "far"]);
    // Nearest-neighbour, not distance-from-origin: after `east`, `east2` is closer than `north`.
    const east = store("east", 0, 0.01);
    const east2 = store("east2", 0, 0.025);
    const north = store("north", 0.012, 0);
    expect(routeStores(origin, [north, east2, east]).map((s) => s.id)).toEqual(["east", "east2", "north"]);
  });

  it("breaks exact distance ties by id and handles empty input", () => {
    const b = store("b", 0.005, 0);
    const a = store("a", 0.005, 0);
    expect(routeStores(origin, [b, a]).map((s) => s.id)).toEqual(["a", "b"]);
    expect(routeStores(origin, [])).toEqual([]);
  });
});

describe("travelFor", () => {
  it("walk cost has zero per-km component (time value only)", () => {
    expect(DEFAULT_OPTIMIZER_CONFIG.transport.walk.costPerKmMinor).toBe(0);
    const t = travelFor(origin, [mid], "walk", DEFAULT_OPTIMIZER_CONFIG);
    expect(t.distanceMeters).toBeGreaterThan(0);
    expect(t.costMinor).toBe(Math.round(t.minutes * DEFAULT_OPTIMIZER_CONFIG.transport.walk.valuePerMinuteMinor));
  });

  it("car > walk cost for the same route (distance cost, time value isolated)", () => {
    const zeroTime: OptimizerConfig = {
      ...DEFAULT_OPTIMIZER_CONFIG,
      transport: {
        walk: { ...DEFAULT_OPTIMIZER_CONFIG.transport.walk, valuePerMinuteMinor: 0 },
        bike: { ...DEFAULT_OPTIMIZER_CONFIG.transport.bike, valuePerMinuteMinor: 0 },
        bus: { ...DEFAULT_OPTIMIZER_CONFIG.transport.bus, valuePerMinuteMinor: 0 },
        car: { ...DEFAULT_OPTIMIZER_CONFIG.transport.car, valuePerMinuteMinor: 0 },
      },
    };
    const route = [near, far];
    const walk = travelFor(origin, route, "walk", zeroTime);
    const car = travelFor(origin, route, "car", zeroTime);
    expect(walk.distanceMeters).toBe(car.distanceMeters);
    expect(walk.costMinor).toBe(0);
    expect(car.costMinor).toBeGreaterThan(walk.costMinor);
    // Car is also faster on the same route.
    const walkDefault = travelFor(origin, route, "walk", DEFAULT_OPTIMIZER_CONFIG);
    const carDefault = travelFor(origin, route, "car", DEFAULT_OPTIMIZER_CONFIG);
    expect(carDefault.minutes).toBeLessThan(walkDefault.minutes);
  });

  it("applies the 1.3 road factor to the round trip and returns integers", () => {
    const t = travelFor(origin, [mid], "car", DEFAULT_OPTIMIZER_CONFIG);
    // 0.01° latitude ≈ 1112m each way → 2224m × 1.3 ≈ 2891m.
    expect(t.distanceMeters).toBeGreaterThan(2880);
    expect(t.distanceMeters).toBeLessThan(2900);
    for (const v of Object.values(t)) expect(Number.isSafeInteger(v)).toBe(true);
    const km = t.distanceMeters / 1000;
    expect(t.minutes).toBe(Math.round((km / 30) * 60));
    expect(t.costMinor).toBe(Math.round(km * 25) + t.minutes * 3);
  });

  it("charges the bus fare once per trip, not per leg", () => {
    const one = travelFor(origin, [near], "bus", DEFAULT_OPTIMIZER_CONFIG);
    const three = travelFor(origin, [near, mid, far], "bus", DEFAULT_OPTIMIZER_CONFIG);
    expect(one.costMinor).toBe(Math.round(one.minutes * 3) + BUS_FARE_PER_TRIP_MINOR);
    expect(three.costMinor).toBe(Math.round(three.minutes * 3) + BUS_FARE_PER_TRIP_MINOR);
  });

  it("returns zeros for an empty route", () => {
    expect(travelFor(origin, [], "bus", DEFAULT_OPTIMIZER_CONFIG)).toEqual({
      distanceMeters: 0,
      minutes: 0,
      costMinor: 0,
    });
  });
});
