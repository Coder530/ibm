import { useReducer } from "react";
import type { CompareEvent } from "@/types/api";
import type { OptimizationResult, Preferences } from "@/types/optimization";
import type { RetailerId, Freshness, StoreDiscoveryResult } from "@/types/retailers";
import type { ShoppingItem } from "@/types/shopping";
import { LIMITS } from "@/lib/validation/schemas";

export type FlowStep = "location" | "list" | "comparing" | "results" | "error";

export interface ResolvedLocation {
  latitude: number;
  longitude: number;
  area: string;
  postcode: string | null;
}

export interface RetailerTickerEntry {
  retailerId: RetailerId;
  status: "searching" | "done" | "error" | "no-store";
  matched: number;
  total: number;
}

export interface FlowError {
  code: Extract<CompareEvent, { type: "error" }>["code"];
  message: string;
}

/** Snapshot of the request in flight — lets the streaming effect depend on
 *  one stable object instead of separately listing location/items/prefs. */
export interface ActiveCompareRequest {
  latitude: number;
  longitude: number;
  items: ShoppingItem[];
  prefs: Preferences;
}

export const DEFAULT_RADIUS_METERS = 8047; // ~5 miles — CLAUDE.md default radius.

export const DEFAULT_PREFS: Preferences = {
  priority: "cheapest",
  maxDistanceMeters: DEFAULT_RADIUS_METERS,
  maxStores: 2,
  transport: "walk",
  matchMode: "cheapest",
};

export interface CompareFlowState {
  step: FlowStep;
  location: ResolvedLocation | null;
  listText: string;
  items: ShoppingItem[];
  parseWarnings: string[];
  prefs: Preferences;
  discovery: StoreDiscoveryResult | null;
  retailerEvents: RetailerTickerEntry[];
  result: OptimizationResult | null;
  offersFreshness: Freshness | null;
  error: FlowError | null;
  /** Bumped on every compare start/retry so effects can key on + abort the previous run. */
  requestId: number;
  activeRequest: ActiveCompareRequest | null;
}

export type CompareFlowAction =
  | { type: "location/set"; location: ResolvedLocation }
  | { type: "location/clear" }
  | { type: "list/change"; listText: string; items: ShoppingItem[]; warnings: string[] }
  | { type: "list/edit" }
  | { type: "prefs/set"; prefs: Preferences }
  | { type: "compare/start" }
  | { type: "compare/retry" }
  | { type: "compare/event"; event: CompareEvent };

export const initialCompareFlowState: CompareFlowState = {
  step: "location",
  location: null,
  listText: "",
  items: [],
  parseWarnings: [],
  prefs: DEFAULT_PREFS,
  discovery: null,
  retailerEvents: [],
  result: null,
  offersFreshness: null,
  error: null,
  requestId: 0,
  activeRequest: null,
};

function clampRadius(meters: number): number {
  return Math.min(LIMITS.maxRadiusMeters, Math.max(LIMITS.minRadiusMeters, meters));
}

function upsertRetailerEvent(
  entries: RetailerTickerEntry[],
  event: Extract<CompareEvent, { type: "retailer" }>
): RetailerTickerEntry[] {
  const next: RetailerTickerEntry = {
    retailerId: event.retailerId,
    status: event.status,
    matched: event.matched,
    total: event.total,
  };
  const index = entries.findIndex((e) => e.retailerId === event.retailerId);
  if (index === -1) return [...entries, next];
  const copy = entries.slice();
  copy[index] = next;
  return copy;
}

function beginCompare(state: CompareFlowState): CompareFlowState {
  // Guard: compare/start and compare/retry are only ever dispatched once a
  // location is resolved (the list step requires it), but stay defensive.
  if (!state.location) return state;
  return {
    ...state,
    step: "comparing",
    discovery: null,
    retailerEvents: [],
    result: null,
    offersFreshness: null,
    error: null,
    requestId: state.requestId + 1,
    activeRequest: {
      latitude: state.location.latitude,
      longitude: state.location.longitude,
      items: state.items,
      prefs: state.prefs,
    },
  };
}

/**
 * Pure reducer for the location → list → comparing → results (+ error) flow.
 * No JSX, no side effects — the streaming client (`compareClient.ts`) is
 * driven from an effect in `ReceiptApp.tsx` that dispatches `compare/event`.
 */
export function compareFlowReducer(
  state: CompareFlowState,
  action: CompareFlowAction
): CompareFlowState {
  switch (action.type) {
    case "location/set":
      return { ...state, location: action.location, step: "list" };

    case "location/clear":
      return { ...state, location: null, step: "location" };

    case "list/change":
      return {
        ...state,
        listText: action.listText,
        items: action.items,
        parseWarnings: action.warnings,
      };

    case "list/edit":
      return {
        ...state,
        step: "list",
        result: null,
        error: null,
      };

    case "prefs/set":
      return {
        ...state,
        prefs: { ...action.prefs, maxDistanceMeters: clampRadius(action.prefs.maxDistanceMeters) },
      };

    case "compare/start":
    case "compare/retry":
      return beginCompare(state);

    case "compare/event": {
      const { event } = action;
      switch (event.type) {
        case "stores":
          return { ...state, discovery: event.discovery };
        case "retailer":
          return { ...state, retailerEvents: upsertRetailerEvent(state.retailerEvents, event) };
        case "result":
          return {
            ...state,
            step: "results",
            result: event.result,
            offersFreshness: event.offersFreshness,
          };
        case "error":
          return {
            ...state,
            step: "error",
            error: { code: event.code, message: event.message },
          };
        default:
          return state;
      }
    }

    default:
      return state;
  }
}

export function useCompareFlow(): [CompareFlowState, React.Dispatch<CompareFlowAction>] {
  return useReducer(compareFlowReducer, initialCompareFlowState);
}
