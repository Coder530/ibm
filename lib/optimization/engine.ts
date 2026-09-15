import type {
  AlternativeLabel,
  BasketLine,
  BasketPlan,
  OptimizationResult,
  OptimizerConfig,
  OptimizerInput,
  Preferences,
  Priority,
} from "@/types/optimization";
import type { ProductOffer } from "@/types/products";
import type { StoreLocation } from "@/types/retailers";
import type { ShoppingItem } from "@/types/shopping";
import { mulMinor, sumMinor } from "@/lib/units/money";
import { parseSize } from "@/lib/units/parseSize";
import { resolveConfig } from "./config";
import { explainResult, formatDistance, type SavingBasis } from "./explain";
import { routeStores, travelFor } from "./travel";

type Origin = { latitude: number; longitude: number };
type Offers = OptimizerInput["offers"];
type Comparator<T> = (a: T, b: T) => number;

const BALANCED_MINUTE_WEIGHT = 5;
const LOW_CONFIDENCE_THRESHOLD = 0.7;
const NOTHING_PRICED_WARNING = "None of your items could be priced at the stores we could reach.";

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareStores(a: StoreLocation, b: StoreLocation): number {
  return a.distanceMeters - b.distanceMeters || compareStrings(a.id, b.id);
}

/** Step 1: in-radius stores, nearest branch per retailer, only retailers with offers. */
function selectStores(stores: readonly StoreLocation[], offers: Offers, prefs: Preferences): StoreLocation[] {
  const nearest = new Map<string, StoreLocation>();
  for (const store of stores) {
    if (!(store.distanceMeters <= prefs.maxDistanceMeters)) continue;
    if (offers[store.retailerId] === undefined) continue;
    const incumbent = nearest.get(store.retailerId);
    if (incumbent === undefined || compareStores(store, incumbent) < 0) {
      nearest.set(store.retailerId, store);
    }
  }
  return [...nearest.values()].sort(compareStores);
}

function combinations<T>(values: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  const pick: T[] = [];
  const walk = (start: number): void => {
    if (pick.length === size) {
      out.push([...pick]);
      return;
    }
    for (let i = start; i < values.length; i++) {
      const value = values[i];
      if (value === undefined) continue;
      pick.push(value);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return out;
}

function offerFor(offers: Offers, store: StoreLocation, itemId: string): ProductOffer | null {
  return offers[store.retailerId]?.[itemId] ?? null;
}

/** Steps 2–3: assign each item to the cheapest available offer in the set and cost the plan. */
function buildPlan(
  set: readonly StoreLocation[],
  items: readonly ShoppingItem[],
  offers: Offers,
  prefs: Preferences,
  cfg: OptimizerConfig,
  origin: Origin
): BasketPlan | null {
  const linesPerStore = new Map<string, number>(set.map((s) => [s.id, 0]));

  const lines: BasketLine[] = items.map((item) => {
    let best: { store: StoreLocation; offer: ProductOffer } | null = null;
    let sawUnavailable = false;
    for (const store of set) {
      const offer = offerFor(offers, store, item.id);
      if (offer === null) continue;
      if (offer.availability !== "available") {
        if (offer.availability === "unavailable") sawUnavailable = true;
        continue;
      }
      // Cheapest price, then nearer store, then retailerId.
      if (
        best === null ||
        (offer.priceMinor - best.offer.priceMinor ||
          store.distanceMeters - best.store.distanceMeters ||
          compareStrings(store.retailerId, best.store.retailerId)) < 0
      ) {
        best = { store, offer };
      }
    }

    if (best === null) {
      return {
        itemId: item.id,
        itemName: item.name,
        quantity: item.quantity,
        store: null,
        offer: null,
        lineTotalMinor: 0,
        status: sawUnavailable ? "unavailable" : "missing",
      };
    }
    linesPerStore.set(best.store.id, (linesPerStore.get(best.store.id) ?? 0) + 1);
    return {
      itemId: item.id,
      itemName: item.name,
      quantity: item.quantity,
      store: best.store,
      offer: best.offer,
      lineTotalMinor: mulMinor(best.offer.priceMinor, item.quantity),
      status: "priced",
    };
  });

  // A store contributing nothing makes this set a duplicate of a smaller one.
  if (set.length > 1 && [...linesPerStore.values()].some((n) => n === 0)) return null;

  const route = routeStores(origin, set);
  const travel = travelFor(origin, route, prefs.transport, cfg);
  const groceriesMinor = sumMinor(lines.map((l) => l.lineTotalMinor));
  const inconvenienceMinor = (set.length - 1) * cfg.inconveniencePerExtraStoreMinor;
  const missingItemIds = lines.filter((l) => l.status !== "priced").map((l) => l.itemId);

  return {
    id: set.map((s) => s.retailerId).sort(compareStrings).join("+"),
    stores: route,
    lines,
    groceriesMinor,
    travelCostMinor: travel.costMinor,
    inconvenienceMinor,
    effectiveCostMinor: sumMinor([groceriesMinor, travel.costMinor, inconvenienceMinor]),
    missingItemIds,
    itemsPriced: lines.length - missingItemIds.length,
    itemsTotal: lines.length,
    travelMinutes: travel.minutes,
    totalDistanceMeters: travel.distanceMeters,
    savingVsNextBestMinor: 0,
    isComplete: missingItemIds.length === 0,
  };
}

export function balancedScore(plan: BasketPlan): number {
  return plan.effectiveCostMinor + Math.round(plan.travelMinutes * BALANCED_MINUTE_WEIGHT);
}

function finalTieBreak(a: BasketPlan, b: BasketPlan): number {
  return (
    a.effectiveCostMinor - b.effectiveCostMinor ||
    a.groceriesMinor - b.groceriesMinor ||
    a.stores.length - b.stores.length ||
    compareStrings(a.id, b.id)
  );
}

/** Step 4: complete before incomplete, more items priced first, then the priority key. */
function rankingComparator(priority: Priority): Comparator<BasketPlan> {
  const key: Comparator<BasketPlan> = (() => {
    switch (priority) {
      case "cheapest":
        return (a, b) => a.effectiveCostMinor - b.effectiveCostMinor;
      case "balanced":
        return (a, b) => balancedScore(a) - balancedScore(b);
      case "fewest-stores":
        return (a, b) => a.stores.length - b.stores.length || a.effectiveCostMinor - b.effectiveCostMinor;
      case "closest":
        return (a, b) =>
          a.totalDistanceMeters - b.totalDistanceMeters || a.effectiveCostMinor - b.effectiveCostMinor;
    }
  })();
  return (a, b) =>
    Number(b.isComplete) - Number(a.isComplete) ||
    b.itemsPriced - a.itemsPriced ||
    key(a, b) ||
    finalTieBreak(a, b);
}

function storeNames(plan: BasketPlan): string {
  const names = plan.stores.map((s) => s.name);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function itemCount(n: number): string {
  return `${n} ${n === 1 ? "item" : "items"}`;
}

/**
 * Step 5 guard: never split for a trivial saving. A k-store plan (k ≥ 2) must
 * beat the cheapest plan with fewer stores that prices at least as many items
 * by `minMultiStoreSavingMinor`, so every extra store has to earn its place.
 * A split that prices strictly more items than any smaller plan passes on
 * coverage alone (and is warned about when chosen).
 */
function passesSplitGuard(
  plan: BasketPlan,
  plans: readonly BasketPlan[],
  cfg: OptimizerConfig
): boolean {
  if (plan.stores.length <= 1) return true;
  let cheapestSmaller: BasketPlan | null = null;
  for (const p of plans) {
    if (p.stores.length >= plan.stores.length || p.itemsPriced < plan.itemsPriced) continue;
    if (cheapestSmaller === null || p.effectiveCostMinor < cheapestSmaller.effectiveCostMinor) {
      cheapestSmaller = p;
    }
  }
  return (
    cheapestSmaller === null ||
    cheapestSmaller.effectiveCostMinor - plan.effectiveCostMinor >= cfg.minMultiStoreSavingMinor
  );
}

/** Step 5: the top-ranked plan among those that pass the split guard. */
function chooseRecommended(ranked: readonly BasketPlan[], warnings: string[]): BasketPlan | null {
  const top = ranked[0];
  if (top === undefined) return null;
  if (top.stores.length === 1) return top;

  const singles = ranked.filter((p) => p.stores.length === 1);
  if (!singles.some((p) => p.itemsPriced >= top.itemsPriced)) {
    const bestSingle = singles[0];
    warnings.push(
      `No single nearby store can price your whole list, so this plan uses ${storeNames(top)} to price ${top.itemsPriced} of ${top.itemsTotal} items` +
        (bestSingle ? ` (the best single store prices ${bestSingle.itemsPriced})` : "")
    );
  }
  return top;
}

/** Grocery totals of two plans over only the items BOTH price. */
function sharedGroceries(
  recommended: BasketPlan,
  other: BasketPlan
): { itemsCompared: number; differenceMinor: number } {
  const otherTotals = new Map<string, number>();
  for (const line of other.lines) {
    if (line.status === "priced") otherTotals.set(line.itemId, line.lineTotalMinor);
  }
  const recommendedShared: number[] = [];
  const otherShared: number[] = [];
  for (const line of recommended.lines) {
    if (line.status !== "priced") continue;
    const total = otherTotals.get(line.itemId);
    if (total === undefined) continue;
    recommendedShared.push(line.lineTotalMinor);
    otherShared.push(total);
  }
  return {
    itemsCompared: recommendedShared.length,
    differenceMinor: sumMinor(otherShared) - sumMinor(recommendedShared),
  };
}

/** The pre-F7 comparison, used only when no candidate shares a priced item. */
function fallbackComparison(recommended: BasketPlan, ranked: readonly BasketPlan[]): BasketPlan | undefined {
  const cheapestCovering = ranked
    .filter((p) => p.stores.length === 1 && p.id !== recommended.id && p.itemsPriced >= recommended.itemsPriced)
    .sort(
      (a, b) =>
        a.groceriesMinor - b.groceriesMinor ||
        a.totalDistanceMeters - b.totalDistanceMeters ||
        compareStrings(a.id, b.id)
    )[0];
  return (
    cheapestCovering ??
    ranked.find((p) => p.stores.length === 1 && p.id !== recommended.id) ??
    ranked.find((p) => p.id !== recommended.id)
  );
}

/**
 * Step 6: the plan the recommendation is compared against. Candidates are
 * single stores with a different store set that price at least as many items
 * and share at least one priced item; each is scored by the grocery difference
 * over the items BOTH price. The most negative wins (a cheaper store is never
 * hidden), else the smallest non-negative; ties → more shared items → nearer.
 * The saving is that difference, never less than zero.
 */
function compareWithAlternative(
  recommended: BasketPlan,
  ranked: readonly BasketPlan[]
): { savingMinor: number; basis: SavingBasis | undefined } {
  const best = ranked
    .filter((p) => p.stores.length === 1 && p.id !== recommended.id && p.itemsPriced >= recommended.itemsPriced)
    .map((plan) => ({ plan, shared: sharedGroceries(recommended, plan) }))
    .filter((c) => c.shared.itemsCompared >= 1)
    .sort(
      (a, b) =>
        a.shared.differenceMinor - b.shared.differenceMinor ||
        b.shared.itemsCompared - a.shared.itemsCompared ||
        a.plan.totalDistanceMeters - b.plan.totalDistanceMeters ||
        compareStrings(a.plan.id, b.plan.id)
    )[0];

  const comparison = best?.plan ?? fallbackComparison(recommended, ranked);
  if (comparison === undefined) return { savingMinor: 0, basis: undefined };

  const shared = best?.shared ?? sharedGroceries(recommended, comparison);
  return {
    savingMinor: Math.max(0, shared.differenceMinor),
    basis: {
      itemsCompared: shared.itemsCompared,
      comparisonItemsPriced: comparison.itemsPriced,
      comparison,
      groceryDifferenceMinor: shared.differenceMinor,
    },
  };
}

/**
 * Step 7: up to three distinct alternatives, excluding the recommendation.
 * `plans` must already be filtered by the split guard; plans that price
 * nothing are never offered.
 */
function pickAlternatives(
  guardedPlans: readonly BasketPlan[],
  recommended: BasketPlan
): { label: AlternativeLabel; plan: BasketPlan }[] {
  const plans = guardedPlans.filter((p) => p.itemsPriced > 0);
  const singles = plans.filter((p) => p.stores.length === 1);

  const cheapestSingle = [...singles].sort(
    (a, b) =>
      Number(b.isComplete) - Number(a.isComplete) ||
      b.itemsPriced - a.itemsPriced ||
      a.groceriesMinor - b.groceriesMinor ||
      finalTieBreak(a, b)
  )[0];
  const closest = [...singles].sort(
    (a, b) =>
      a.totalDistanceMeters - b.totalDistanceMeters ||
      b.itemsPriced - a.itemsPriced ||
      finalTieBreak(a, b)
  )[0];
  const bestBalance = [...plans].sort(rankingComparator("balanced"))[0];

  const candidates: [AlternativeLabel, BasketPlan | undefined][] = [
    ["cheapest-single", cheapestSingle],
    ["closest", closest],
    ["best-balance", bestBalance],
  ];
  const used = new Set<string>([recommended.id]);
  const out: { label: AlternativeLabel; plan: BasketPlan }[] = [];
  for (const [label, plan] of candidates) {
    if (plan === undefined || used.has(plan.id)) continue;
    used.add(plan.id);
    out.push({ label, plan });
  }
  return out;
}

/** Step 8: partial-basket and low-confidence warnings. */
function basketWarnings(
  recommended: BasketPlan,
  items: readonly ShoppingItem[],
  kept: readonly StoreLocation[],
  offers: Offers,
  someRetailersUnreachable: boolean
): string[] {
  const warnings: string[] = [];
  const priceableAnywhere = (itemId: string): boolean =>
    kept.some((store) => offerFor(offers, store, itemId)?.availability === "available");

  const nowhere = items.filter((item) => !priceableAnywhere(item.id));
  if (nowhere.length > 0) {
    warnings.push(
      `${itemCount(nowhere.length)} couldn't be priced at any nearby store${someRetailersUnreachable ? " we could reach" : ""}: ${nowhere.map((i) => i.name).join(", ")}`
    );
  }

  const missingIds = new Set(recommended.missingItemIds);
  const elsewhere = items.filter((item) => missingIds.has(item.id) && priceableAnywhere(item.id));
  if (elsewhere.length > 0) {
    warnings.push(
      `${itemCount(elsewhere.length)} not priced at ${storeNames(recommended)} but available at other nearby stores: ${elsewhere.map((i) => i.name).join(", ")}`
    );
  }

  const priced = recommended.lines.filter((l) => l.offer !== null && l.store !== null);
  const estimated = priced.filter((l) => l.offer?.quantityEstimated === true);
  if (estimated.length > 0) {
    const itemsById = new Map(items.map((item) => [item.id, item]));
    warnings.push(
      `Quantity estimated from typical weights, check before you buy: ${estimated
        .map((l) => estimatedLabel(l, itemsById.get(l.itemId)))
        .join(", ")}`
    );
  }

  // Estimated lines already have their own warning; don't repeat them here.
  const lowConfidence = priced.filter(
    (l) =>
      l.offer !== null &&
      l.offer.quantityEstimated !== true &&
      l.offer.confidence < LOW_CONFIDENCE_THRESHOLD
  );
  if (lowConfidence.length > 0) {
    warnings.push(
      `Low-confidence matches, check before you buy: ${lowConfidence
        .map((l) => `${l.itemName} (${l.offer?.productName ?? ""} at ${l.store?.name ?? ""})`)
        .join(", ")}`
    );
  }
  return warnings;
}

const PACKS_PREFIX_RE = /^\d+ × /;

/** "12 bananas (2 × 1kg)", "6 bananas × 2 (2 × 1kg)": the count asked for and the packs priced for it. */
function estimatedLabel(line: BasketLine, item: ShoppingItem | undefined): string {
  const measure = item?.size ? parseSize(item.size) : null;
  const named = measure?.kind === "count" ? `${measure.count} ${line.itemName}` : line.itemName;
  const wanted = line.quantity > 1 ? `${named} × ${line.quantity}` : named;
  const size = line.offer?.size;
  if (size === undefined) return wanted;
  return `${wanted} (${PACKS_PREFIX_RE.test(size) ? size : `1 × ${size}`})`;
}

/**
 * Pure, deterministic basket optimizer. No I/O, clocks or randomness; all money
 * is integer pence. Missing items are listed and excluded from totals.
 */
export function optimizeBasket(
  input: OptimizerInput & { origin: Origin }
): OptimizationResult {
  const { items, offers, prefs, origin } = input;
  const cfg = resolveConfig(prefs, input.config);
  const kept = selectStores(input.stores, offers, prefs);

  if (kept.length === 0) {
    const partial = {
      recommended: null,
      alternatives: [],
      warnings: [`No supported stores within ${formatDistance(prefs.maxDistanceMeters)}`],
    };
    return { ...partial, explanation: explainResult(partial, prefs) };
  }

  const plans: BasketPlan[] = [];
  const maxSize = Math.min(cfg.maxRecommendedStores, kept.length);
  for (let size = 1; size <= maxSize; size++) {
    for (const set of combinations(kept, size)) {
      const plan = buildPlan(set, items, offers, prefs, cfg, origin);
      if (plan !== null) plans.push(plan);
    }
  }

  // Splits that fail the guard are never recommended nor offered as alternatives.
  const guarded = plans.filter((plan) => passesSplitGuard(plan, plans, cfg));
  const ranked = [...guarded].sort(rankingComparator(prefs.priority));
  const splitWarnings: string[] = [];
  const chosen = chooseRecommended(ranked, splitWarnings);
  if (chosen === null) {
    // Unreachable while `kept` is non-empty: every kept store yields a single-store plan.
    throw new Error("optimizeBasket: no plan could be built for a non-empty store set");
  }
  // Ranking puts more items priced first, so the top plan pricing nothing means every plan does.
  if (chosen.itemsPriced === 0) {
    const partial = { recommended: null, alternatives: [], warnings: [NOTHING_PRICED_WARNING] };
    return { ...partial, explanation: explainResult(partial, prefs) };
  }

  const saving = compareWithAlternative(chosen, ranked);
  const recommended: BasketPlan = { ...chosen, savingVsNextBestMinor: saving.savingMinor };
  const alternatives = pickAlternatives(guarded, recommended);
  const warnings = [...splitWarnings, ...basketWarnings(recommended, items, kept, offers, (input.unreachableRetailerIds ?? []).length > 0)];

  const partial = { recommended, alternatives, warnings };
  return { ...partial, explanation: explainResult(partial, prefs, saving.basis) };
}
