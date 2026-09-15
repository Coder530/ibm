"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { OptimizationResult, Transport } from "@/types/optimization";
import type { Freshness } from "@/types/retailers";
import { formatDistance } from "@/lib/optimization/explain";
import { formatMinor } from "@/lib/units/money";
import { Odometer } from "@/components/ui/Odometer";
import { TornEdge } from "@/components/ui/TornEdge";
import { Stamp } from "@/components/ui/Stamp";
import { FreshnessBadge } from "@/components/ui/FreshnessBadge";
import { Button } from "@/components/ui/Button";

interface ReceiptHeroProps {
  result: OptimizationResult;
  offersFreshness: Freshness;
  transport: Transport;
  onWidenRadius: () => void;
  onEditList: () => void;
}

const TRANSPORT_LABEL: Record<Transport, string> = {
  walk: "walking",
  bike: "cycling",
  bus: "by bus",
  car: "driving",
};

/**
 * The winning receipt — the results page's lead surface. Always shows a
 * FreshnessBadge (P1) and always lists missing items when present (P3).
 */
export function ReceiptHero({
  result,
  offersFreshness,
  transport,
  onWidenRadius,
  onEditList,
}: ReceiptHeroProps) {
  const reducedMotion = useReducedMotion();
  const plan = result.recommended;
  const headingRef = useRef<HTMLHeadingElement>(null);

  // U3: ReceiptHero only ever mounts once the flow reaches the "results"
  // step (it isn't present at initial page load), so a mount effect is the
  // right place to move focus to whichever heading this render produced —
  // the empty-state heading below, or the success heading further down.
  useEffect(() => {
    const el = headingRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }, [reducedMotion]);

  if (!plan) {
    return (
      <div className="relative bg-receipt p-6">
        <TornEdge edge="top" className="absolute -top-4 left-0" />
        <div className="mb-3 flex items-start justify-between gap-3">
          <p className="receipt-label">No basket yet</p>
          <FreshnessBadge freshness={offersFreshness} />
        </div>
        <h2 ref={headingRef} tabIndex={-1} className="mb-2 font-display text-2xl text-ink">
          We couldn&apos;t put a basket together
        </h2>
        {result.warnings.length > 0 ? (
          <ul className="mb-5 list-disc pl-5 text-sm text-ink-soft">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={onWidenRadius} variant="secondary">
            Widen search radius
          </Button>
          <Button onClick={onEditList} variant="ghost">
            Edit your list
          </Button>
        </div>
        <TornEdge edge="bottom" className="absolute -bottom-4 left-0" />
      </div>
    );
  }

  const storeNames = plan.stores.map((s) => s.name);
  const missingLines = plan.lines.filter((l) => l.status !== "priced");
  // The engine measures savingVsNextBestMinor against the comparison store the
  // explanation names, over the items both plans price, so the stamp never
  // names a store itself or appears on a partial basket; the explanation below
  // carries the exact basis. It also must not contradict an alternative card
  // that prices at least as many items but costs less on groceries alone
  // (V3a) — in that case the explanation carries the detail and no stamp shows.
  const showSavingStamp =
    plan.isComplete &&
    plan.savingVsNextBestMinor > 0 &&
    result.alternatives.every(
      (alt) => alt.plan.itemsPriced < plan.itemsPriced || plan.groceriesMinor <= alt.plan.groceriesMinor
    );

  const onlyStore = plan.stores.length === 1 ? plan.stores[0] : undefined;
  const headerLine =
    onlyStore !== undefined
      ? `${formatDistance(onlyStore.distanceMeters)} away · ${formatDistance(plan.totalDistanceMeters)} round trip · ${plan.travelMinutes} min ${TRANSPORT_LABEL[transport]}`
      : `${plan.stores.length} stores · ${formatDistance(plan.totalDistanceMeters)} round trip · ${plan.travelMinutes} min ${TRANSPORT_LABEL[transport]}`;

  return (
    <motion.div
      initial={reducedMotion ? undefined : { clipPath: "inset(0% 0 100% 0)" }}
      animate={reducedMotion ? undefined : { clipPath: "inset(0% 0 0% 0)" }}
      transition={{ duration: 0.55, ease: "easeOut" }}
      className="relative bg-receipt p-6"
    >
      <TornEdge edge="top" className="absolute -top-4 left-0" />

      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="receipt-label">Your cheapest shop</p>
        <FreshnessBadge freshness={offersFreshness} />
      </div>

      <h2 ref={headingRef} tabIndex={-1} className="mb-1 font-display text-2xl text-ink sm:text-3xl">
        {storeNames.join(" + ")}
      </h2>
      <p className="mb-4 font-mono text-sm tabular-nums text-ink-soft">{headerLine}</p>

      <Odometer minor={plan.groceriesMinor} className="mb-4 block text-5xl sm:text-6xl" />

      {showSavingStamp ? (
        <Stamp className="mb-4">Saves {formatMinor(plan.savingVsNextBestMinor)} on groceries</Stamp>
      ) : null}

      <p className="mb-5 max-w-prose text-sm text-ink">{result.explanation}</p>

      {/* Engine/compare warnings (estimated quantities, low-confidence matches,
          retailers that couldn't be priced) must be visible on a successful
          result too, never only when no basket could be built (P3). */}
      {result.warnings.length > 0 ? (
        <div className="mb-5 border-l-2 border-amber pl-3">
          <p className="receipt-label mb-1">Check before you buy</p>
          <ul className="list-disc pl-4 text-sm text-ink-soft">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="border-t border-rule pt-4">
        <p className="receipt-label mb-1">
          {plan.itemsPriced}/{plan.itemsTotal} items priced
        </p>
        {missingLines.length > 0 ? (
          <ul className="text-sm text-tomato-ink">
            {missingLines.map((line) => (
              <li key={line.itemId}>
                {line.itemName} — {line.status === "unavailable" ? "unavailable" : "not priced"}, excluded from
                total
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <TornEdge edge="bottom" className="absolute -bottom-4 left-0" />
    </motion.div>
  );
}
