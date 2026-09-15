import type { ProductOffer, RetailerAdapter, MatchOptions } from "@/types/products";
import type { ShoppingItem } from "@/types/shopping";
import { RETAILERS, type RetailerId } from "@/types/retailers";
import { getCatalogProducts, DEMO_SOURCE } from "@/lib/pricing/demoCatalog";
import { matchItem } from "@/lib/products/matcher";
import { parseSize } from "@/lib/units/parseSize";
import { unitPriceMinor } from "@/lib/units/unitPrice";
import { mulMinor } from "@/lib/units/money";

/**
 * Builds a RetailerAdapter backed by the committed DEMO catalog
 * (lib/pricing/demoCatalog.ts). Every offer it returns carries
 * freshness: 'demo' and source: DEMO_SOURCE — never presented as real (P1).
 */
export function createDemoAdapter(retailerId: RetailerId): RetailerAdapter {
  // Out-of-stock catalog entries never become offers — they flow through as
  // null (missing), same as an unmatched item (P3).
  const candidates = getCatalogProducts(retailerId).filter((product) => product.available);

  return {
    retailer: RETAILERS[retailerId],
    async findOffers(
      items: ShoppingItem[],
      opts: MatchOptions
    ): Promise<Map<string, ProductOffer | null>> {
      const offers = new Map<string, ProductOffer | null>();

      for (const item of items) {
        const match = matchItem(item, candidates, opts);
        if (!match) {
          offers.set(item.id, null);
          continue;
        }

        const { product, confidence, quantityMultiplier, quantityEstimated } = match;
        const priceMinor = mulMinor(product.priceMinor, quantityMultiplier);
        const size = quantityMultiplier > 1 ? `${quantityMultiplier} × ${product.size}` : product.size;
        const measure = parseSize(product.size);
        const unit = measure ? unitPriceMinor(product.priceMinor, measure) : null;

        const offer: ProductOffer = {
          retailerId,
          productId: product.productId,
          productName: product.productName,
          priceMinor,
          currency: "GBP",
          size,
          ...(unit ? { unitPriceMinor: unit.unitPriceMinor, unit: unit.unit } : {}),
          availability: "available",
          confidence,
          freshness: "demo",
          source: DEMO_SOURCE,
          isOwnBrand: product.isOwnBrand,
          ...(quantityEstimated === true ? { quantityEstimated: true } : {}),
        };
        offers.set(item.id, offer);
      }

      return offers;
    },
  };
}
