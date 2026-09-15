"use client";

import type { MouseEvent } from "react";
import { useReducedMotion } from "motion/react";
import type { BasketPlan } from "@/types/optimization";
import { formatMinor } from "@/lib/units/money";

interface StickySummaryProps {
  plan: BasketPlan;
  breakdownId: string;
}

/** Mobile-only sticky bottom bar: total, store(s), jump link to the breakdown. */
export function StickySummary({ plan, breakdownId }: StickySummaryProps) {
  const reducedMotion = useReducedMotion();

  // U9: the plain "#id" href already jumps there, but BasketBreakdown's
  // container is only focusable via tabIndex={-1} (not natively), and we
  // want the scroll to honour reduced motion rather than the browser's
  // default instant jump-then-CSS-smooth mismatch — so handle it ourselves.
  const handleJump = (event: MouseEvent<HTMLAnchorElement>): void => {
    const target = document.getElementById(breakdownId);
    if (!target) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-rule bg-receipt px-4 py-3 md:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex min-w-0 flex-col">
        <span className="font-mono text-lg font-semibold tabular-nums text-ink">
          {formatMinor(plan.groceriesMinor)}
        </span>
        <span className="truncate text-xs text-ink-soft">{plan.stores.map((s) => s.name).join(" + ")}</span>
      </div>
      <a
        href={`#${breakdownId}`}
        onClick={handleJump}
        className="inline-flex min-h-11 shrink-0 items-center border border-ink px-3 text-sm font-medium text-ink transition-colors duration-150 hover:bg-ink hover:text-receipt"
      >
        View breakdown
      </a>
    </div>
  );
}
