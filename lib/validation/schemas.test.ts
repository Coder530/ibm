import { describe, expect, it } from "vitest";
import {
  LIMITS,
  compareRequestSchema,
  geocodeRequestSchema,
  preferencesSchema,
  shoppingItemSchema,
} from "./schemas";

describe("geocodeRequestSchema", () => {
  it("accepts a postcode payload", () => {
    expect(geocodeRequestSchema.safeParse({ postcode: "SW1A 1AA" }).success).toBe(true);
  });

  it("accepts a coordinate payload", () => {
    expect(
      geocodeRequestSchema.safeParse({ latitude: 51.5, longitude: -0.1 }).success
    ).toBe(true);
  });

  it("rejects an empty or malformed payload", () => {
    expect(geocodeRequestSchema.safeParse({}).success).toBe(false);
    expect(geocodeRequestSchema.safeParse({ latitude: 999, longitude: 0 }).success).toBe(
      false
    );
  });
});

describe("shoppingItemSchema", () => {
  it("accepts a valid item", () => {
    expect(
      shoppingItemSchema.safeParse({ id: "1", name: "Milk", quantity: 2 }).success
    ).toBe(true);
  });

  it("rejects a name over the max length and non-integer quantity", () => {
    expect(
      shoppingItemSchema.safeParse({
        id: "1",
        name: "x".repeat(LIMITS.maxNameLength + 1),
        quantity: 1,
      }).success
    ).toBe(false);
    expect(
      shoppingItemSchema.safeParse({ id: "1", name: "Milk", quantity: 1.5 }).success
    ).toBe(false);
  });

  it("rejects an id over the max length (S7)", () => {
    expect(
      shoppingItemSchema.safeParse({
        id: "x".repeat(LIMITS.maxIdLength + 1),
        name: "Milk",
        quantity: 1,
      }).success
    ).toBe(false);
  });

  it("rejects unit/size/category over the max attribute length (S7)", () => {
    const oversize = "x".repeat(LIMITS.maxAttrLength + 1);
    expect(
      shoppingItemSchema.safeParse({ id: "1", name: "Milk", quantity: 1, unit: oversize })
        .success
    ).toBe(false);
    expect(
      shoppingItemSchema.safeParse({ id: "1", name: "Milk", quantity: 1, size: oversize })
        .success
    ).toBe(false);
    expect(
      shoppingItemSchema.safeParse({ id: "1", name: "Milk", quantity: 1, category: oversize })
        .success
    ).toBe(false);
  });
});

describe("preferencesSchema", () => {
  it("accepts valid preferences", () => {
    expect(
      preferencesSchema.safeParse({
        priority: "cheapest",
        maxDistanceMeters: 5000,
        maxStores: 2,
        transport: "car",
        matchMode: "cheapest",
      }).success
    ).toBe(true);
  });

  it("rejects an invalid priority value", () => {
    expect(
      preferencesSchema.safeParse({
        priority: "fastest",
        maxDistanceMeters: 5000,
        maxStores: 2,
        transport: "car",
        matchMode: "cheapest",
      }).success
    ).toBe(false);
  });
});

describe("compareRequestSchema", () => {
  const validPrefs = {
    priority: "cheapest" as const,
    maxDistanceMeters: 5000,
    maxStores: 2 as const,
    transport: "car" as const,
    matchMode: "cheapest" as const,
  };

  it("accepts a valid compare request within UK bounds", () => {
    expect(
      compareRequestSchema.safeParse({
        latitude: 51.5,
        longitude: -0.1,
        items: [{ id: "1", name: "Milk", quantity: 1 }],
        prefs: validPrefs,
      }).success
    ).toBe(true);
  });

  it("rejects coordinates outside the UK bounds", () => {
    expect(
      compareRequestSchema.safeParse({
        latitude: 40.7,
        longitude: -74,
        items: [{ id: "1", name: "Milk", quantity: 1 }],
        prefs: validPrefs,
      }).success
    ).toBe(false);
  });

  it("rejects an empty items array", () => {
    expect(
      compareRequestSchema.safeParse({
        latitude: 51.5,
        longitude: -0.1,
        items: [],
        prefs: validPrefs,
      }).success
    ).toBe(false);
  });
});
