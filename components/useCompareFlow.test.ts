import { describe, expect, it } from "vitest";
import type { CompareEvent } from "@/types/api";
import type { BasketPlan, OptimizationResult } from "@/types/optimization";
import type { ShoppingItem } from "@/types/shopping";
import {
  compareFlowReducer,
  initialCompareFlowState,
  type CompareFlowState,
} from "./useCompareFlow";

const ITEMS: ShoppingItem[] = [{ id: "item-0", name: "milk", quantity: 1 }];

const PLAN: BasketPlan = {
  id: "tesco",
  stores: [
    {
      id: "s1",
      retailerId: "tesco",
      name: "Tesco Express",
      latitude: 51.5,
      longitude: -0.12,
      address: "1 High St",
      distanceMeters: 400,
    },
  ],
  lines: [],
  groceriesMinor: 199,
  travelCostMinor: 0,
  inconvenienceMinor: 0,
  effectiveCostMinor: 199,
  missingItemIds: [],
  itemsPriced: 1,
  itemsTotal: 1,
  travelMinutes: 5,
  totalDistanceMeters: 400,
  savingVsNextBestMinor: 0,
  isComplete: true,
};

const RESULT: OptimizationResult = {
  recommended: PLAN,
  alternatives: [],
  explanation: "Tesco Express prices everything on your list.",
  warnings: [],
};

function dispatchAll(state: CompareFlowState, actions: Parameters<typeof compareFlowReducer>[1][]) {
  return actions.reduce(compareFlowReducer, state);
}

describe("compareFlowReducer", () => {
  it("walks location → list → comparing → results", () => {
    let state = initialCompareFlowState;
    expect(state.step).toBe("location");

    state = compareFlowReducer(state, {
      type: "location/set",
      location: { latitude: 51.5, longitude: -0.12, area: "Westminster", postcode: "SW1A 1AA" },
    });
    expect(state.step).toBe("list");
    expect(state.location?.area).toBe("Westminster");

    state = compareFlowReducer(state, {
      type: "list/change",
      listText: "milk",
      items: ITEMS,
      warnings: [],
    });
    expect(state.step).toBe("list");
    expect(state.items).toEqual(ITEMS);

    state = compareFlowReducer(state, { type: "compare/start" });
    expect(state.step).toBe("comparing");

    const resultEvent: CompareEvent = { type: "result", result: RESULT, offersFreshness: "demo" };
    state = compareFlowReducer(state, { type: "compare/event", event: resultEvent });
    expect(state.step).toBe("results");
    expect(state.result).toEqual(RESULT);
    expect(state.offersFreshness).toBe("demo");
  });

  it("returns to comparing on retry after an error", () => {
    let state = dispatchAll(initialCompareFlowState, [
      { type: "location/set", location: { latitude: 51.5, longitude: -0.12, area: "Soho", postcode: null } },
      { type: "list/change", listText: "milk", items: ITEMS, warnings: [] },
      { type: "compare/start" },
    ]);
    expect(state.step).toBe("comparing");

    const errorEvent: CompareEvent = { type: "error", code: "no_stores", message: "No stores nearby." };
    state = compareFlowReducer(state, { type: "compare/event", event: errorEvent });
    expect(state.step).toBe("error");
    expect(state.error).toEqual({ code: "no_stores", message: "No stores nearby." });

    state = compareFlowReducer(state, { type: "compare/retry" });
    expect(state.step).toBe("comparing");
    expect(state.error).toBeNull();
  });

  it("keeps location when editing the list from results", () => {
    const location = { latitude: 51.5, longitude: -0.12, area: "Camden", postcode: "NW1 8AH" };
    let state = dispatchAll(initialCompareFlowState, [
      { type: "location/set", location },
      { type: "list/change", listText: "milk", items: ITEMS, warnings: [] },
      { type: "compare/start" },
      {
        type: "compare/event",
        event: { type: "result", result: RESULT, offersFreshness: "demo" },
      },
    ]);
    expect(state.step).toBe("results");
    expect(state.location).toEqual(location);

    state = compareFlowReducer(state, { type: "list/edit" });
    expect(state.step).toBe("list");
    expect(state.location).toEqual(location);
    expect(state.items).toEqual(ITEMS);
  });

  it("increments requestId on every compare start so effects can key on it", () => {
    let state = dispatchAll(initialCompareFlowState, [
      { type: "location/set", location: { latitude: 51.5, longitude: -0.12, area: "Soho", postcode: null } },
      { type: "list/change", listText: "milk", items: ITEMS, warnings: [] },
    ]);
    state = compareFlowReducer(state, { type: "compare/start" });
    const first = state.requestId;
    expect(state.activeRequest).not.toBeNull();
    state = compareFlowReducer(state, { type: "compare/retry" });
    expect(state.requestId).toBe(first + 1);
  });

  it("does not start a compare without a resolved location", () => {
    const state = compareFlowReducer(initialCompareFlowState, { type: "compare/start" });
    expect(state.step).toBe("location");
    expect(state.activeRequest).toBeNull();
  });
});
