import type { StoreLocation } from "./retailers";
import type { ProductOffer, MatchMode } from "./products";
import type { ShoppingItem } from "./shopping";
import type { RetailerId } from "./retailers";

export type Priority = "cheapest" | "balanced" | "fewest-stores" | "closest";
export type Transport = "walk" | "bike" | "bus" | "car";

export type Preferences = {
  priority: Priority;
  maxDistanceMeters: number;
  maxStores: 1 | 2 | 3;
  transport: Transport;
  matchMode: MatchMode;
};

export interface OptimizerConfig {
  minMultiStoreSavingMinor: number;
  maxRecommendedStores: 1 | 2 | 3;
  inconveniencePerExtraStoreMinor: number;
  transport: Record<
    Transport,
    { costPerKmMinor: number; speedKmh: number; valuePerMinuteMinor: number }
  >;
}

export interface BasketLine {
  itemId: string;
  itemName: string;
  quantity: number;
  store: StoreLocation | null;
  offer: ProductOffer | null;
  lineTotalMinor: number;
  status: "priced" | "missing" | "unavailable";
}

export interface BasketPlan {
  id: string;
  stores: StoreLocation[];
  lines: BasketLine[];
  groceriesMinor: number;
  travelCostMinor: number;
  inconvenienceMinor: number;
  effectiveCostMinor: number;
  missingItemIds: string[];
  itemsPriced: number;
  itemsTotal: number;
  travelMinutes: number;
  totalDistanceMeters: number;
  savingVsNextBestMinor: number;
  isComplete: boolean;
}

export type AlternativeLabel = "best-balance" | "cheapest-single" | "closest";

export interface OptimizationResult {
  recommended: BasketPlan | null;
  alternatives: { label: AlternativeLabel; plan: BasketPlan }[];
  explanation: string;
  warnings: string[];
}

export interface OptimizerInput {
  items: ShoppingItem[];
  stores: StoreLocation[];
  offers: Partial<Record<RetailerId, Record<string, ProductOffer | null>>>;
  prefs: Preferences;
  config: OptimizerConfig;
  /** Retailers that errored or timed out: their absence is not "doesn't stock it". */
  unreachableRetailerIds?: RetailerId[];
}
