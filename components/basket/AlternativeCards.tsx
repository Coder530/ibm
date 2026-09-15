import type { AlternativeLabel, BasketPlan } from "@/types/optimization";
import { formatMinor } from "@/lib/units/money";
import { formatDistance } from "@/lib/optimization/explain";

interface AlternativeCardsProps {
  alternatives: { label: AlternativeLabel; plan: BasketPlan }[];
  recommended: BasketPlan;
  selectedId: string;
  onSelect: (planId: string) => void;
}

const LABEL_TEXT: Record<AlternativeLabel, string> = {
  "best-balance": "Best balance",
  "cheapest-single": "Cheapest single store",
  closest: "Closest",
};

/**
 * Up to three alternative baskets. Selecting one only swaps which plan's
 * breakdown is shown below — the recommendation itself never changes here.
 */
export function AlternativeCards({ alternatives, recommended, selectedId, onSelect }: AlternativeCardsProps) {
  if (alternatives.length === 0) return null;

  const cards: { label: AlternativeLabel | null; plan: BasketPlan }[] = [
    { label: null, plan: recommended },
    ...alternatives,
  ];

  return (
    <div className="flex flex-col gap-2">
      <p className="receipt-label">Alternatives</p>
      <ul className="flex flex-col gap-2">
        {cards.map(({ label, plan }) => {
          const selected = plan.id === selectedId;
          // P2: integer subtraction of two plans' effectiveCostMinor is the allowed exception.
          const deltaMinor = plan.effectiveCostMinor - recommended.effectiveCostMinor;
          const deltaSign = deltaMinor === 0 ? "" : deltaMinor > 0 ? "+" : "−";
          const deltaTone = deltaMinor === 0 ? "text-ink-soft" : deltaMinor > 0 ? "text-tomato-ink" : "text-sage";
          const onlyStore = plan.stores.length === 1 ? plan.stores[0] : undefined;
          const distanceLine =
            onlyStore !== undefined
              ? `${formatDistance(onlyStore.distanceMeters)} away · ${formatDistance(plan.totalDistanceMeters)} round trip`
              : `${formatDistance(plan.totalDistanceMeters)} round trip`;

          return (
            <li key={plan.id}>
              <button
                type="button"
                onClick={() => onSelect(plan.id)}
                aria-pressed={selected}
                className={`flex w-full flex-col gap-1 border p-3 text-left transition-colors duration-150 ${
                  selected ? "border-ink bg-receipt" : "border-rule hover:bg-receipt"
                }`}
              >
                <span className="receipt-label">{label ? LABEL_TEXT[label] : "Recommended"}</span>
                <span className="font-display text-lg text-ink">{plan.stores.map((s) => s.name).join(" + ")}</span>
                <span className="flex items-baseline justify-between font-mono text-sm tabular-nums text-ink">
                  <span>{formatMinor(plan.groceriesMinor)}</span>
                  <span className={deltaTone}>
                    {deltaMinor === 0
                      ? "same overall cost"
                      : `${deltaSign}${formatMinor(Math.abs(deltaMinor))} overall incl. travel`}
                  </span>
                </span>
                <span className="text-xs text-ink-soft">{distanceLine}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
