import { describe, expect, it } from "vitest";
import { RETAILER_IDS } from "@/types/retailers";
import { CANONICAL_PRODUCTS } from "@/lib/products/synonyms";
import { ADAPTERS } from "@/lib/retailers/registry";
import catalogJson from "@/data/retailers/demo-catalog.json";
import type { ShoppingItem } from "@/types/shopping";

interface RawCatalogEntry {
  productName: string;
  available: boolean;
}

type CatalogProducts = Record<string, Partial<Record<string, RawCatalogEntry | null>>>;

const CATALOG_PRODUCTS = (catalogJson as { products: CatalogProducts }).products;

function item(name: string): ShoppingItem {
  return { id: "probe", name, quantity: 1 };
}

/**
 * Integration probe: every stocked+available catalog cell must be findable
 * by its own canonical first name. This is the regression for SPEC F1 —
 * the catalog generator and the matcher must agree on what a "qualifier" is.
 */
describe("catalog <-> matcher integration", () => {
  it("finds every stocked, available product by its canonical first name", async () => {
    const failures: string[] = [];
    let checked = 0;

    for (const key of Object.keys(CATALOG_PRODUCTS)) {
      const canonical = CANONICAL_PRODUCTS.find((p) => p.key === key);
      if (!canonical) continue;
      const firstName = canonical.names[0];
      if (firstName === undefined) continue;

      const byRetailer = CATALOG_PRODUCTS[key] ?? {};
      for (const retailerId of RETAILER_IDS) {
        const cell = byRetailer[retailerId];
        if (!cell || !cell.available) continue;

        checked++;
        const offers = await ADAPTERS[retailerId].findOffers([item(firstName)], { mode: "cheapest" });
        const offer = offers.get("probe");
        const expectedProductId = `${retailerId}:${key}`;
        if (!offer || offer.productId !== expectedProductId) {
          failures.push(
            `${retailerId}:${key} (item "${firstName}") -> ${offer ? offer.productId : "null"}`
          );
        }
      }
    }

    expect(checked).toBeGreaterThan(0);
    if (failures.length > 0) {
      console.log(`catalogIntegration: ${failures.length}/${checked} cells unmatchable`);
    }
    expect(failures).toEqual([]);
  });

  it('item "oat milk" never yields a semi/whole/skimmed dairy-milk productId', async () => {
    for (const retailerId of RETAILER_IDS) {
      const offers = await ADAPTERS[retailerId].findOffers([item("oat milk")], { mode: "cheapest" });
      const offer = offers.get("probe");
      if (!offer) continue;
      expect(offer.productId.endsWith(":milk-semi")).toBe(false);
      expect(offer.productId.endsWith(":milk-whole")).toBe(false);
      expect(offer.productId.endsWith(":milk-skimmed")).toBe(false);
    }
  });

  it('item "milk" never yields an oat/soya milk productId', async () => {
    for (const retailerId of RETAILER_IDS) {
      const offers = await ADAPTERS[retailerId].findOffers([item("milk")], { mode: "cheapest" });
      const offer = offers.get("probe");
      if (!offer) continue;
      expect(offer.productId.endsWith(":milk-oat")).toBe(false);
      expect(offer.productId.endsWith(":milk-soya")).toBe(false);
    }
  });
});
