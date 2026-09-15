import type { RetailerId, StoreDiscoveryResult, Freshness } from "./retailers";
import type { OptimizationResult } from "./optimization";

export type GeocodeResponse =
  | { ok: true; area: string; postcode: string | null; latitude: number; longitude: number }
  | {
      ok: false;
      code: "invalid_postcode" | "not_found" | "upstream_error" | "bad_request" | "rate_limited";
      message: string;
    };

export type CompareEvent =
  | { type: "stores"; discovery: StoreDiscoveryResult }
  | {
      type: "retailer";
      retailerId: RetailerId;
      status: "searching" | "done" | "error" | "no-store";
      matched: number;
      total: number;
    }
  | { type: "result"; result: OptimizationResult; offersFreshness: Freshness }
  | {
      type: "error";
      code:
        | "no_stores"
        | "stores_unavailable"
        | "pricing_unavailable"
        | "rate_limited"
        | "bad_request"
        | "internal";
      message: string;
    };
