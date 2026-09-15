import type { RetailerId, Retailer, Freshness } from "./retailers";
import type { ShoppingItem } from "./shopping";

export type PriceUnit = "kg" | "l" | "100g" | "item";

export interface ProductOffer {
  retailerId: RetailerId;
  productId: string;
  productName: string;
  priceMinor: number;
  currency: "GBP";
  size?: string;
  unitPriceMinor?: number;
  unit?: PriceUnit;
  availability: "available" | "unavailable" | "unknown";
  confidence: number;
  freshness: Freshness;
  source: string;
  url?: string;
  isOwnBrand: boolean;
  /** Pack count estimated from typical item weights (e.g. "12 bananas" as 1kg bags). */
  quantityEstimated?: boolean;
}

export type MatchMode = "cheapest" | "closest-match" | "own-brand-ok";

export interface MatchOptions {
  mode: MatchMode;
}

export interface RetailerAdapter {
  retailer: Retailer;
  findOffers(
    items: ShoppingItem[],
    opts: MatchOptions
  ): Promise<Map<string, ProductOffer | null>>;
}
