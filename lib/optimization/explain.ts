import type {
  BasketPlan,
  OptimizationResult,
  Preferences,
  Priority,
  Transport,
} from "@/types/optimization";
import { formatMinor } from "@/lib/units/money";

const METERS_PER_MILE = 1609.344;

export function formatDistance(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  return `${miles.toFixed(1)} ${miles.toFixed(1) === "1.0" ? "mile" : "miles"}`;
}

const LEAD: Record<Priority, string> = {
  cheapest: "Your cheapest option",
  balanced: "Your best balance of price and travel",
  "fewest-stores": "Your simplest option",
  closest: "Your closest option",
};

const CHEAPEST_ONCE_TRAVEL_COUNTED = "Your cheapest option once travel is counted";

/** What the shopper gives up by not taking a cheaper-on-groceries store. */
const TRADE_OFF: Record<Exclude<Priority, "cheapest">, string> = {
  balanced: "balance",
  "fewest-stores": "fewer stores",
  closest: "being closest",
};

const TRANSPORT_WORD: Record<Transport, string> = {
  walk: "walking",
  bike: "by bike",
  bus: "by bus",
  car: "driving",
};

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function ensureSentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function itemsPhrase(plan: BasketPlan): string {
  return plan.itemsPriced === plan.itemsTotal
    ? `all ${plan.itemsTotal} ${plan.itemsTotal === 1 ? "item" : "items"}`
    : `${plan.itemsPriced} of ${plan.itemsTotal} items`;
}

/** How the recommended plan compares with the plan named in the explanation. */
export interface SavingBasis {
  /** Items priced by both the recommended plan and the comparison plan. */
  itemsCompared: number;
  /** Items the comparison plan prices in total. */
  comparisonItemsPriced: number;
  /** The plan the recommendation is compared against; always named in the copy. */
  comparison: BasketPlan;
  /** Comparison minus recommended groceries over the shared items; negative when the comparison is cheaper. */
  groceryDifferenceMinor: number;
}

function pricedItemIds(plan: BasketPlan): Set<string> {
  return new Set(plan.lines.filter((l) => l.status === "priced").map((l) => l.itemId));
}

function sameItems(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

function savingScope(plan: BasketPlan, basis: SavingBasis): string {
  if (basis.itemsCompared === plan.itemsPriced && basis.comparisonItemsPriced === plan.itemsPriced) {
    return "";
  }
  return ` on the ${basis.itemsCompared} ${basis.itemsCompared === 1 ? "item" : "items"} both price`;
}

/**
 * Names the comparison store(s). A saving is only claimed when the
 * recommendation really is cheaper on groceries; otherwise the cheaper store
 * is named with what it costs to get there.
 */
function comparisonSentence(plan: BasketPlan, prefs: Preferences, basis: SavingBasis): string | null {
  const name = joinNames(basis.comparison.stores.map((s) => s.name));
  const scope = savingScope(plan, basis);

  if (basis.groceryDifferenceMinor > 0 && plan.savingVsNextBestMinor > 0) {
    return `That's ${formatMinor(plan.savingVsNextBestMinor)} less on groceries than ${name}${scope}.`;
  }
  if (basis.groceryDifferenceMinor >= 0) return null;

  const recommendedIds = pricedItemIds(plan);
  const estimated = basis.comparison.lines.some(
    (l) => l.status === "priced" && recommendedIds.has(l.itemId) && l.offer?.quantityEstimated === true
  );
  const cheaper = `${name}${estimated ? " (estimated quantity)" : ""} is ${formatMinor(-basis.groceryDifferenceMinor)} cheaper on groceries${scope}`;
  const distance = `${formatDistance(basis.comparison.totalDistanceMeters)} round trip`;
  // An overall figure or trade-off over different item sets would count
  // unmatched items as travel, whatever the priority.
  if (!sameItems(recommendedIds, pricedItemIds(basis.comparison))) {
    return `${cheaper} (${distance}), but it doesn't price the same items, so it isn't directly comparable.`;
  }
  // Only frame distance as the drawback when the comparison really is the longer trip.
  const longerTrip = basis.comparison.totalDistanceMeters > plan.totalDistanceMeters;
  if (prefs.priority === "cheapest") {
    const extraMinor = basis.comparison.effectiveCostMinor - plan.effectiveCostMinor;
    return extraMinor > 0 && longerTrip
      ? `${cheaper}, but it's ${distance}, so once travel and time are counted it costs ${formatMinor(extraMinor)} more overall.`
      : `${cheaper} (${distance}).`;
  }
  if (!longerTrip) return `${cheaper} (${distance}).`;
  const tradeOff =
    prefs.priority === "fewest-stores" && basis.comparison.stores.length === plan.stores.length
      ? "a shorter trip"
      : TRADE_OFF[prefs.priority];
  return `${cheaper} (${distance}) if price matters more than ${tradeOff}.`;
}

/** Plain-English summary of an optimization result. Pure. */
export function explainResult(
  result: Omit<OptimizationResult, "explanation">,
  prefs: Preferences,
  savingBasis?: SavingBasis
): string {
  const plan = result.recommended;
  if (plan === null) {
    const reasons = result.warnings.map(ensureSentence).join(" ");
    return reasons
      ? `We couldn't build a basket. ${reasons}`
      : "We couldn't build a basket for this list.";
  }

  const sentences: string[] = [];
  const lead =
    prefs.priority === "cheapest" && savingBasis !== undefined && savingBasis.groceryDifferenceMinor < 0
      ? CHEAPEST_ONCE_TRAVEL_COUNTED
      : LEAD[prefs.priority];
  const total = formatMinor(plan.groceriesMinor);

  const onlyStore = plan.stores.length === 1 ? plan.stores[0] : undefined;
  if (onlyStore !== undefined) {
    sentences.push(
      `${lead} is ${onlyStore.name} (${formatDistance(onlyStore.distanceMeters)} away): ${total} for ${itemsPhrase(plan)}.`
    );
  } else {
    sentences.push(
      `${lead} is to split your shop between ${joinNames(plan.stores.map((s) => s.name))}: ${total} for ${itemsPhrase(plan)}.`
    );
  }

  const comparison = savingBasis === undefined ? null : comparisonSentence(plan, prefs, savingBasis);
  if (comparison !== null) sentences.push(comparison);

  if (plan.totalDistanceMeters > 0) {
    const extras =
      plan.inconvenienceMinor > 0
        ? `, plus ${formatMinor(plan.inconvenienceMinor)} for the extra ${plan.stores.length - 1 === 1 ? "stop" : "stops"}`
        : "";
    sentences.push(
      `The round trip is about ${formatDistance(plan.totalDistanceMeters)} (${plan.travelMinutes} min ${TRANSPORT_WORD[prefs.transport]}), which we count as ${formatMinor(plan.travelCostMinor)} of travel and time${extras}.`
    );
  }

  const unpriced = plan.lines.filter((l) => l.status !== "priced").map((l) => l.itemName);
  if (unpriced.length > 0) {
    sentences.push(
      `${unpriced.length} of ${plan.itemsTotal} items couldn't be priced and aren't included in the total: ${joinNames(unpriced)}.`
    );
  }

  return sentences.join(" ");
}
