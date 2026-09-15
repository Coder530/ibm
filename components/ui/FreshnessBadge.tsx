"use client";

import { useId, useState } from "react";
import type { Freshness } from "@/types/retailers";

interface FreshnessBadgeProps {
  freshness: Freshness;
  cachedDate?: string | null;
  className?: string;
}

const COPY: Record<Freshness, { label: string; explain: string }> = {
  demo: {
    label: "Demo prices",
    explain:
      "These prices come from a bundled demo catalogue, not a live retailer feed. Treat the total as illustrative, not a real quote.",
  },
  cached: {
    label: "Cached",
    explain:
      "Store locations are from a saved snapshot, not a live lookup, because the live map service was unreachable.",
  },
  live: {
    label: "Live",
    explain: "Store locations came from a live map lookup just now.",
  },
};

const TONE_CLASS: Record<Freshness, string> = {
  demo:
    "border-tomato text-tomato-ink bg-[repeating-linear-gradient(135deg,var(--color-tomato-soft)_0,var(--color-tomato-soft)_4px,transparent_4px,transparent_8px)]",
  cached: "border-amber text-amber bg-amber-soft",
  live: "border-sage text-sage bg-sage-soft",
};

/** Freshness label for a price/store surface — always derived from event data, never assumed. */
export function FreshnessBadge({ freshness, cachedDate, className = "" }: FreshnessBadgeProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const copy = COPY[freshness];
  const label = freshness === "cached" && cachedDate ? `Cached · ${cachedDate}` : copy.label;

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-describedby={tooltipId}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex min-h-6 items-center gap-1 rounded-sm border px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider uppercase ${TONE_CLASS[freshness]}`}
      >
        {label}
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={`absolute top-full left-0 z-10 mt-1 w-56 rounded-sm border border-rule bg-receipt p-2 text-xs text-ink-soft ${
          open ? "block" : "hidden"
        }`}
      >
        {copy.explain}
      </span>
    </span>
  );
}
