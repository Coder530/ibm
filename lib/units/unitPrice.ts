import type { PriceUnit } from "@/types/products";
import type { Measure } from "./parseSize";
import { assertMinor } from "./money";

/**
 * Computes a comparable unit price for a priced item.
 * Mass is always £/kg, volume always £/l and count-based packs £/item, so
 * every pack of the same kind is compared on one basis regardless of size.
 * Rounding is half-up to the nearest integer penny (Math.round).
 */
export function unitPriceMinor(
  priceMinor: number,
  m: Measure
): { unitPriceMinor: number; unit: PriceUnit } {
  assertMinor(priceMinor);

  switch (m.kind) {
    case "mass": {
      if (!(m.grams > 0)) {
        throw new Error(`unitPriceMinor: grams must be positive, got ${m.grams}`);
      }
      return {
        unitPriceMinor: Math.round((priceMinor * 1000) / m.grams),
        unit: "kg",
      };
    }
    case "volume": {
      if (!(m.ml > 0)) {
        throw new Error(`unitPriceMinor: ml must be positive, got ${m.ml}`);
      }
      return {
        unitPriceMinor: Math.round((priceMinor * 1000) / m.ml),
        unit: "l",
      };
    }
    case "count": {
      if (!(m.count > 0)) {
        throw new Error(`unitPriceMinor: count must be positive, got ${m.count}`);
      }
      return {
        unitPriceMinor: Math.round(priceMinor / m.count),
        unit: "item",
      };
    }
  }
}
