import { describe, expect, it } from "vitest";
import { RETAILER_IDS } from "@/types/retailers";
import { generateCatalog } from "./generate-demo-catalog";

describe("generateCatalog", () => {
  it("is deterministic: running it twice produces an identical object", () => {
    const first = generateCatalog();
    const second = generateCatalog();
    expect(second).toEqual(first);
  });

  it("carries the DEMO notice and every retailer key per product", () => {
    const catalog = generateCatalog();
    expect(catalog._notice).toContain("DEMO");
    expect(catalog.generatedFor).toBeTruthy();

    const [firstProductKey] = Object.keys(catalog.products);
    expect(firstProductKey).toBeDefined();
    const byRetailer = catalog.products[firstProductKey as string] ?? {};
    for (const retailerId of RETAILER_IDS) {
      expect(byRetailer).toHaveProperty(retailerId);
    }
  });

  it("produces only positive integer prices for present entries", () => {
    const catalog = generateCatalog();
    for (const byRetailer of Object.values(catalog.products)) {
      for (const entry of Object.values(byRetailer)) {
        if (entry === null || entry === undefined) continue;
        expect(Number.isInteger(entry.priceMinor)).toBe(true);
        expect(entry.priceMinor).toBeGreaterThan(0);
      }
    }
  });
});
