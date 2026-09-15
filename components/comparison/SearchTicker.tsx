"use client";

import { useEffect, useRef, useState } from "react";
import { RETAILER_IDS, RETAILERS, type StoreDiscoveryResult } from "@/types/retailers";
import type { RetailerTickerEntry } from "@/components/useCompareFlow";

interface SearchTickerProps {
  retailerEvents: RetailerTickerEntry[];
  discovery: StoreDiscoveryResult | null;
  radiusMeters: number;
}

const METERS_PER_MILE = 1609.34;

const STATUS_ICON: Record<RetailerTickerEntry["status"], string> = {
  searching: "⋯",
  done: "✓",
  error: "✕",
  "no-store": "—",
};

const STATUS_LABEL: Record<RetailerTickerEntry["status"], string> = {
  searching: "Searching",
  done: "Done",
  error: "Couldn't reach",
  "no-store": "No store nearby",
};

function statusToneClass(status: RetailerTickerEntry["status"]): string {
  switch (status) {
    case "done":
      return "text-sage";
    case "error":
      return "text-tomato-ink";
    default:
      return "text-ink-soft";
  }
}

const ANNOUNCE_MIN_INTERVAL_MS = 1000;
const TOTAL_RETAILERS = RETAILER_IDS.length;

function buildSummary(retailerEvents: RetailerTickerEntry[], discovery: StoreDiscoveryResult | null): string {
  const checked = retailerEvents.filter((e) => e.status !== "searching").length;
  if (TOTAL_RETAILERS > 0 && checked >= TOTAL_RETAILERS) {
    return "Finished checking prices.";
  }
  if (discovery) {
    const storeCount = discovery.stores.length;
    return `Found ${storeCount} ${storeCount === 1 ? "store" : "stores"}. Checked ${checked} of ${TOTAL_RETAILERS} retailers.`;
  }
  return `Checked ${checked} of ${TOTAL_RETAILERS} retailers.`;
}

/** Thermal-printer style progress ticker driven by retailer CompareEvents. */
export function SearchTicker({ retailerEvents, discovery, radiusMeters }: SearchTickerProps) {
  const radiusMiles = Math.round(radiusMeters / METERS_PER_MILE);

  // The itemised list below updates far too often (once per retailer, often
  // several times a second) for a live region — U8 replaces per-item
  // aria-live with one summary announcement, throttled to at most once a
  // second with a guaranteed trailing update so the final state is always
  // read out even if events stop arriving mid-window.
  const summary = buildSummary(retailerEvents, discovery);
  const [announced, setAnnounced] = useState(summary);
  const lastAnnouncedAt = useRef(0);
  const pendingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastAnnouncedAt.current;

    if (elapsed >= ANNOUNCE_MIN_INTERVAL_MS) {
      lastAnnouncedAt.current = now;
      setAnnounced(summary);
      return;
    }

    if (pendingTimeout.current) clearTimeout(pendingTimeout.current);
    pendingTimeout.current = setTimeout(() => {
      lastAnnouncedAt.current = Date.now();
      setAnnounced(summary);
      pendingTimeout.current = null;
    }, ANNOUNCE_MIN_INTERVAL_MS - elapsed);

    return () => {
      if (pendingTimeout.current) {
        clearTimeout(pendingTimeout.current);
        pendingTimeout.current = null;
      }
    };
  }, [summary]);

  return (
    <div className="flex flex-col gap-2 font-mono text-sm">
      <span role="status" className="sr-only">
        {announced}
      </span>
      {discovery ? (
        <p className="receipt-label text-ink">
          Found {discovery.stores.length} {discovery.stores.length === 1 ? "store" : "stores"} within{" "}
          {radiusMiles} mi ·{" "}
          {discovery.freshness === "live"
            ? "Live OSM"
            : discovery.snapshotDate
              ? `Cached map data (${discovery.snapshotDate})`
              : "Cached map data"}
        </p>
      ) : (
        <p className="receipt-label text-ink-soft">Finding nearby stores…</p>
      )}

      <ul className="flex flex-col gap-1.5">
        {retailerEvents.map((entry) => {
          const retailer = RETAILERS[entry.retailerId];
          return (
            <li key={entry.retailerId} className="flex items-baseline gap-2 animate-print">
              <span className="tracking-wide text-ink uppercase">{retailer.name}</span>
              <span aria-hidden="true" className="mb-1 flex-1 border-b border-dotted border-rule" />
              <span className={`inline-flex items-center gap-1.5 tabular-nums ${statusToneClass(entry.status)}`}>
                <span aria-hidden="true">{STATUS_ICON[entry.status]}</span>
                <span className="sr-only">{STATUS_LABEL[entry.status]}</span>
                {entry.status !== "searching" ? `${entry.matched}/${entry.total}` : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
