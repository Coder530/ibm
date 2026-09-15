"use client";

import { motion, useReducedMotion } from "motion/react";
import { RETAILERS, type StoreLocation } from "@/types/retailers";
import { LABEL_OFFSET_Y, SIZE, plotRadiusFor, radarLabelText, selectRadarPoints } from "./radarPoints";

interface StoreRadarProps {
  origin: { latitude: number; longitude: number };
  stores: StoreLocation[];
  radiusMeters: number;
  recommendedStoreIds?: readonly string[];
}

const CENTER = SIZE / 2;
const MAX_PLOT_RADIUS = CENTER - 30;
const RING_MILES = [1, 3, 5] as const;
const METERS_PER_MILE = 1609.34;
const STAGGER_MS = 0.05;

function formatMiles(meters: number): string {
  return (meters / METERS_PER_MILE).toFixed(1);
}

function formatRadiusMiles(meters: number): string {
  const rounded = Math.round((meters / METERS_PER_MILE) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * SVG polar radar — centre is the shopper, blips plot real bearing/distance.
 * A one-time sweep plays on mount; the recommended store(s) pulse. Only a
 * small labelled set (nearest store per retailer, plus any recommended
 * store) carries a text label — the rest render as small, low-opacity
 * background dots, so a dense city centre with hundreds of stores never
 * renders as an unreadable blob of overlapping labels (SPEC F5 / V1).
 */
export function StoreRadar({ origin, stores, radiusMeters, recommendedStoreIds = [] }: StoreRadarProps) {
  const reducedMotion = useReducedMotion();
  const { labelled, background, totalStores, nearestPerRetailer, youLabelY } = selectRadarPoints(
    origin,
    stores,
    radiusMeters,
    recommendedStoreIds
  );

  const rings = RING_MILES.filter((mi) => mi * METERS_PER_MILE <= radiusMeters);

  // Text alternatives list the nearest store of EVERY retailer, including any
  // whose visual label was skipped only to avoid overlap.
  const summary =
    totalStores === 0
      ? "No stores found nearby."
      : `${totalStores} stores within ${formatRadiusMiles(radiusMeters)} mi. Nearest of each: ${nearestPerRetailer
          .map((p) => `${RETAILERS[p.store.retailerId].name} ${formatMiles(p.distanceMeters)} mi`)
          .join(", ")}.`;

  return (
    <div className="flex flex-col gap-3">
      <svg role="img" aria-label={summary} viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto w-full max-w-72">
        {rings.map((mi) => {
          const r = plotRadiusFor(mi * METERS_PER_MILE, radiusMeters);
          return (
            <g key={mi} aria-hidden="true">
              <circle cx={CENTER} cy={CENTER} r={r} fill="none" stroke="var(--color-rule)" strokeWidth={1} />
              <text x={CENTER + 4} y={CENTER - r - 3} className="fill-ink-faint" fontSize={9} fontFamily="var(--font-mono)">
                {mi} mi
              </text>
            </g>
          );
        })}

        {!reducedMotion ? (
          <motion.circle
            aria-hidden="true"
            cx={CENTER}
            cy={CENTER}
            r={MAX_PLOT_RADIUS}
            fill="none"
            stroke="var(--color-tomato)"
            strokeWidth={1.5}
            initial={{ opacity: 0.9, scale: 0.12 }}
            animate={{ opacity: 0, scale: 1 }}
            transition={{ duration: 1.3, ease: "easeOut" }}
            style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
          />
        ) : null}

        <circle aria-hidden="true" cx={CENTER} cy={CENTER} r={4} fill="var(--color-ink)" />
        <text
          aria-hidden="true"
          x={CENTER}
          y={youLabelY}
          textAnchor="middle"
          className="fill-ink"
          fontSize={9}
          fontFamily="var(--font-mono)"
        >
          YOU
        </text>

        {/* Background: every other in-radius store, plotted as small dots only — no
            labels, no per-dot stagger, one group fade-in at most. */}
        {reducedMotion ? (
          <g aria-hidden="true">
            {background.map(({ store, x, y }) => (
              <circle key={store.id} cx={x} cy={y} r={2} fill={RETAILERS[store.retailerId].color} opacity={0.35} />
            ))}
          </g>
        ) : (
          <motion.g
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            {background.map(({ store, x, y }) => (
              <circle key={store.id} cx={x} cy={y} r={2} fill={RETAILERS[store.retailerId].color} opacity={0.35} />
            ))}
          </motion.g>
        )}

        {labelled.map(({ store, x, y, recommended }, index) => {
          const retailer = RETAILERS[store.retailerId];
          const circleProps = {
            cx: x,
            cy: y,
            r: recommended ? 6 : 4.5,
            fill: retailer.color,
            stroke: "var(--color-receipt)",
            strokeWidth: 1.5,
          };
          return (
            <g key={store.id}>
              {reducedMotion ? (
                <circle {...circleProps} className={recommended ? "animate-blip" : undefined} />
              ) : (
                <motion.circle
                  {...circleProps}
                  className={recommended ? "animate-blip" : undefined}
                  style={{ transformOrigin: `${x}px ${y}px` }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.5 + index * STAGGER_MS, type: "spring", stiffness: 300, damping: 18 }}
                />
              )}
              {/* Halo (paint-order stroke) keeps the label legible over background dots. */}
              <text
                aria-hidden="true"
                x={x}
                y={y - LABEL_OFFSET_Y}
                textAnchor="middle"
                fontSize={9}
                fontWeight={600}
                fontFamily="var(--font-mono)"
                className="fill-ink"
                stroke="var(--color-receipt)"
                strokeWidth={3}
                strokeLinejoin="round"
                style={{ paintOrder: "stroke" }}
              >
                {radarLabelText(store)}
              </text>
            </g>
          );
        })}
      </svg>

      <ul className="sr-only">
        {nearestPerRetailer.map(({ store, distanceMeters }) => (
          <li key={store.id}>
            {store.name} ({RETAILERS[store.retailerId].name}) — {formatMiles(distanceMeters)} miles away
          </li>
        ))}
      </ul>
    </div>
  );
}
