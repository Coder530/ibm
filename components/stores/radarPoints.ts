import { RETAILERS, type RetailerId, type StoreLocation } from "@/types/retailers";
import { bearingDegrees, haversineMeters } from "@/lib/location/geo";

/** SVG viewBox size — keep in sync with StoreRadar's viewBox. */
export const SIZE = 280;
const CENTER = SIZE / 2;
const MAX_PLOT_RADIUS = CENTER - 30;

const DEFAULT_MAX_LABELLED = 12;
const DEFAULT_MAX_BACKGROUND = 80;
const DEFAULT_LABEL_COLLISION_DISTANCE = 14;

/** A store label's baseline sits this many SVG units above its blip. */
export const LABEL_OFFSET_Y = 9;
/** The "YOU" label's baseline sits this many SVG units below the centre by default. */
export const YOU_LABEL_OFFSET_Y = 17;
/** Fallback: baseline this many SVG units above the centre when a recommended label would cover "YOU". */
export const YOU_LABEL_ABOVE_OFFSET_Y = 8;
const LABEL_FONT_SIZE = 9;
// Approximate JetBrains Mono advance at fontSize 9 (0.6em) — used only to
// estimate label boxes for overlap checks, never for layout.
const LABEL_CHAR_WIDTH = 5.6;
const LABEL_BOX_PADDING = 6;

export interface RadarPoint {
  store: StoreLocation;
  x: number;
  y: number;
  distanceMeters: number;
  recommended: boolean;
}

export interface RadarSelection {
  /** Nearest store of each retailer within the radius, plus every recommended store. */
  labelled: RadarPoint[];
  /** Remaining in-radius stores, nearest first, capped. Render as small dots only. */
  background: RadarPoint[];
  /** Count of stores within the radius (labelled + background). */
  totalStores: number;
  /**
   * Nearest store of each retailer within the radius, BEFORE label-collision
   * skipping. Text alternatives (aria-label, sr-only list) use this, so a
   * label hidden only to avoid visual overlap never disappears for
   * screen-reader users.
   */
  nearestPerRetailer: RadarPoint[];
  /** Baseline Y for the "YOU" label (below the centre unless a recommended label would cover it). */
  youLabelY: number;
}

export interface SelectRadarPointsOptions {
  /** Cap on background (unlabelled) dots. Default 80. */
  maxBackground?: number;
  /** Cap on labelled points; recommended stores are never dropped even past this cap. Default 12. */
  maxLabelled?: number;
  /** Minimum SVG-unit distance between two labels before the later one is skipped. Default 14. */
  labelCollisionDistance?: number;
}

function polarToXY(bearingDeg: number, radius: number): { x: number; y: number } {
  const rad = (bearingDeg * Math.PI) / 180;
  return { x: CENTER + radius * Math.sin(rad), y: CENTER - radius * Math.cos(rad) };
}

/**
 * Plot radius for a real distance. Square-root scale: stores near the shopper
 * spread out instead of piling into the centre, which a linear scale does in
 * any dense town (0.2 mi of a 5 mi radius is 4 units linear, ~22 units here).
 * Rings must use this same function so they stay truthful.
 */
export function plotRadiusFor(distanceMeters: number, radiusMeters: number): number {
  if (!(radiusMeters > 0)) return 0;
  const ratio = Math.min(1, Math.max(0, distanceMeters / radiusMeters));
  return Math.sqrt(ratio) * MAX_PLOT_RADIUS;
}

/** The text rendered next to a labelled blip (single source for StoreRadar and overlap checks). */
export function radarLabelText(store: StoreLocation): string {
  return RETAILERS[store.retailerId].name;
}

interface LabelBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Estimated box of a label whose baseline is at `baselineY`, centred on `x`. */
function labelBoxAt(text: string, x: number, baselineY: number): LabelBox {
  const halfWidth = (text.length * LABEL_CHAR_WIDTH + LABEL_BOX_PADDING) / 2;
  return { left: x - halfWidth, right: x + halfWidth, top: baselineY - LABEL_FONT_SIZE, bottom: baselineY + 2 };
}

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function toRadarPoint(
  origin: { latitude: number; longitude: number },
  store: StoreLocation,
  radiusMeters: number,
  recommendedIds: ReadonlySet<string>
): RadarPoint {
  const distanceMeters = haversineMeters(origin.latitude, origin.longitude, store.latitude, store.longitude);
  const bearing = bearingDegrees(origin.latitude, origin.longitude, store.latitude, store.longitude);
  const plotRadius = plotRadiusFor(distanceMeters, radiusMeters);
  const { x, y } = polarToXY(bearing, plotRadius);
  return { store, x, y, distanceMeters, recommended: recommendedIds.has(store.id) };
}

function byDistanceThenId(a: RadarPoint, b: RadarPoint): number {
  return a.distanceMeters - b.distanceMeters || a.store.id.localeCompare(b.store.id);
}

/** True if `point`'s label would sit within `minDistance` SVG units of an already-placed label. */
function collidesWithPlaced(point: RadarPoint, placed: readonly RadarPoint[], minDistance: number): boolean {
  return placed.some((p) => Math.hypot(p.x - point.x, p.y - point.y) < minDistance);
}

/**
 * Pure selection/geometry for the store radar (SPEC F5 / V1). Plots every
 * store within the radius, then splits them into a small labelled set (the
 * nearest store of each retailer, plus any recommended store) and a capped,
 * unlabelled background set — so a dense city centre with hundreds of
 * stores never renders as an unreadable blob of overlapping labels.
 */
export function selectRadarPoints(
  origin: { latitude: number; longitude: number },
  stores: readonly StoreLocation[],
  radiusMeters: number,
  recommendedStoreIds: readonly string[] = [],
  opts: SelectRadarPointsOptions = {}
): RadarSelection {
  const maxBackground = opts.maxBackground ?? DEFAULT_MAX_BACKGROUND;
  const maxLabelled = opts.maxLabelled ?? DEFAULT_MAX_LABELLED;
  const labelCollisionDistance = opts.labelCollisionDistance ?? DEFAULT_LABEL_COLLISION_DISTANCE;
  const recommendedIds = new Set(recommendedStoreIds);

  const within = stores
    .map((store) => toRadarPoint(origin, store, radiusMeters, recommendedIds))
    .filter((point) => point.distanceMeters <= radiusMeters)
    .sort(byDistanceThenId);

  const nearestByRetailer = new Map<RetailerId, RadarPoint>();
  for (const point of within) {
    if (!nearestByRetailer.has(point.store.retailerId)) {
      nearestByRetailer.set(point.store.retailerId, point);
    }
  }

  // Dedup nearest-per-retailer with recommended stores by id.
  const candidateMap = new Map<string, RadarPoint>();
  for (const point of nearestByRetailer.values()) candidateMap.set(point.store.id, point);
  for (const point of within) {
    if (point.recommended) candidateMap.set(point.store.id, point);
  }

  const candidates = Array.from(candidateMap.values()).sort(byDistanceThenId);
  const recommendedCandidates = candidates.filter((p) => p.recommended);
  const otherCandidates = candidates.filter((p) => !p.recommended);

  // Recommended stores are placed first and are never skipped — neither for
  // collision nor for the labelled cap. Everything else fills the remaining
  // slots, nearest first, skipping any label whose blip sits too close to an
  // already-placed one OR whose text box would overlap a placed label or the
  // "YOU" label (text width matters: "Sainsbury's" is far wider than "Aldi").
  const placed: RadarPoint[] = [...recommendedCandidates];
  const recommendedBoxes = recommendedCandidates.map((p) =>
    labelBoxAt(radarLabelText(p.store), p.x, p.y - LABEL_OFFSET_Y)
  );
  // Recommended labels are never moved, so if one would cover "YOU" (a store
  // right next to the shopper), move "YOU" above the centre instead.
  const youLabelY =
    [CENTER + YOU_LABEL_OFFSET_Y, CENTER - YOU_LABEL_ABOVE_OFFSET_Y].find(
      (baselineY) => !recommendedBoxes.some((box) => boxesOverlap(box, labelBoxAt("YOU", CENTER, baselineY)))
    ) ?? CENTER + YOU_LABEL_OFFSET_Y;
  const placedBoxes: LabelBox[] = [labelBoxAt("YOU", CENTER, youLabelY), ...recommendedBoxes];
  for (const point of otherCandidates) {
    if (placed.length >= maxLabelled) break;
    if (collidesWithPlaced(point, placed, labelCollisionDistance)) continue;
    const box = labelBoxAt(radarLabelText(point.store), point.x, point.y - LABEL_OFFSET_Y);
    if (placedBoxes.some((placedBox) => boxesOverlap(placedBox, box))) continue;
    placed.push(point);
    placedBoxes.push(box);
  }

  const labelled = placed.sort(byDistanceThenId);
  const labelledIds = new Set(labelled.map((p) => p.store.id));

  const background = within.filter((point) => !labelledIds.has(point.store.id)).slice(0, maxBackground);

  return {
    labelled,
    background,
    totalStores: within.length,
    nearestPerRetailer: Array.from(nearestByRetailer.values()).sort(byDistanceThenId),
    youLabelY,
  };
}
