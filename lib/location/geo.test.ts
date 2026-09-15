import { describe, expect, it } from "vitest";
import { bearingDegrees, haversineMeters } from "./geo";

describe("haversineMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineMeters(51.5, -0.1, 51.5, -0.1)).toBe(0);
  });

  it("computes a known distance (London to Paris, ~344km)", () => {
    const distance = haversineMeters(51.5074, -0.1278, 48.8566, 2.3522);
    expect(distance).toBeGreaterThan(340_000);
    expect(distance).toBeLessThan(350_000);
  });
});

describe("bearingDegrees", () => {
  it("returns a value within [0, 360)", () => {
    const bearing = bearingDegrees(51.5074, -0.1278, 48.8566, 2.3522);
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
  });

  it("points due north as 0 degrees", () => {
    const bearing = bearingDegrees(51.0, 0.0, 52.0, 0.0);
    expect(bearing).toBeCloseTo(0, 5);
  });

  it("points due east as 90 degrees", () => {
    const bearing = bearingDegrees(0.0, 0.0, 0.0, 1.0);
    expect(bearing).toBeCloseTo(90, 5);
  });
});
