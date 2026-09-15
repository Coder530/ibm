import { z } from "zod";
import { RETAILER_IDS, type RetailerId } from "@/types/retailers";
import type { CatalogProduct } from "@/lib/products/matcher";
import catalogJson from "@/data/retailers/demo-catalog.json";

/** Source label stamped on every offer built from this catalog (P1/P2). */
export const DEMO_SOURCE = "demo-catalog";

const catalogEntrySchema = z.object({
  productName: z.string().min(1),
  brand: z.string().min(1).nullable(),
  isOwnBrand: z.boolean(),
  size: z.string().min(1),
  priceMinor: z.number().int().nonnegative(),
  available: z.boolean(),
  qualifiers: z.array(z.string()),
});

const catalogSchema = z.object({
  _notice: z.string().min(1),
  generatedFor: z.string().min(1),
  products: z.record(z.string(), z.record(z.string(), catalogEntrySchema.nullable())),
});

// The catalog JSON is checked-in but still treated as untrusted external
// data and validated once at module load (Security & Trust).
const CATALOG = catalogSchema.parse(catalogJson);

if (!CATALOG._notice.includes("DEMO")) {
  throw new Error("demo-catalog.json: _notice must identify this data as DEMO.");
}

const BY_RETAILER: Record<RetailerId, CatalogProduct[]> = RETAILER_IDS.reduce(
  (acc, id) => {
    acc[id] = [];
    return acc;
  },
  {} as Record<RetailerId, CatalogProduct[]>
);

for (const [productKey, byRetailer] of Object.entries(CATALOG.products)) {
  for (const retailerId of RETAILER_IDS) {
    const entry = byRetailer[retailerId];
    if (!entry) continue;
    BY_RETAILER[retailerId].push({
      productKey,
      productId: `${retailerId}:${productKey}`,
      productName: entry.productName,
      brand: entry.brand,
      isOwnBrand: entry.isOwnBrand,
      size: entry.size,
      priceMinor: entry.priceMinor,
      available: entry.available,
      qualifiers: entry.qualifiers,
    });
  }
}

/** All catalog products stocked by `retailerId` (including out-of-stock ones). */
export function getCatalogProducts(retailerId: RetailerId): readonly CatalogProduct[] {
  return BY_RETAILER[retailerId];
}

/** Always true — this loader only ever serves the DEMO catalog (P1). */
export function isDemoData(): true {
  return true;
}
