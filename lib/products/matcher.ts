import type { MatchOptions } from "@/types/products";
import type { ShoppingItem } from "@/types/shopping";
import { mulMinor } from "@/lib/units/money";
import { parseSize, type Measure } from "@/lib/units/parseSize";
import {
  AMBIGUOUS_NAMES,
  APPROX_ITEM_GRAMS,
  canonicalise,
  CONNECTOR_WORDS,
  getCanonicalProduct,
  intrinsicQualifiers,
  isNoiseToken,
  MATERIAL_QUALIFIERS,
  meaningfulStems,
  normaliseQualifier,
  stemToken,
  tokenize,
} from "./synonyms";

export interface CatalogProduct {
  productKey: string;
  productId: string;
  productName: string;
  brand: string | null;
  isOwnBrand: boolean;
  size: string;
  priceMinor: number;
  available: boolean;
  qualifiers: string[];
}

export interface MatchResult {
  product: CatalogProduct;
  confidence: number;
  quantityMultiplier: number;
  /** The pack count was estimated from typical item weights (a count of a weight-sold product). */
  quantityEstimated?: boolean;
}

const MAX_QUANTITY_MULTIPLIER = 12;
const MIN_CONFIDENCE = 0.5;
const MIN_TOKEN_SCORE = 0.6;
const CONFIDENCE_EXACT = 1;
const CONFIDENCE_SIZE_DIFFERS = 0.85;
// Both sit strictly below the engine's 0.7 low-confidence threshold so these
// matches are always flagged to the shopper.
const CONFIDENCE_TOKEN_CAP = 0.65;
const CONFIDENCE_QTY_APPROX = 0.65;
// Tolerance for float noise in measure ratios (e.g. pints → ml).
const RATIO_EPSILON = 1e-9;
const PERCENT_RE = /\d+(?:\.\d+)?%/g;
/** Percentages that never change what a product is: "100% orange juice" is orange juice. */
const NOISE_PERCENTS: ReadonlySet<string> = new Set(["100%"]);
/** Percentages implied by the canonical product: "2% milk" is semi-skimmed milk. */
const IMPLIED_PERCENTS: Readonly<Record<string, readonly string[]>> = { "milk-semi": ["2%"] };

interface Scored {
  product: CatalogProduct;
  confidence: number;
  quantityMultiplier: number;
  quantityEstimated: boolean;
  sameMeasureKind: boolean;
  effectivePriceMinor: number;
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

const MATERIAL_QUALIFIER_SET: ReadonlySet<string> = new Set(MATERIAL_QUALIFIERS);
const AMBIGUOUS_NAME_SET: ReadonlySet<string> = new Set(AMBIGUOUS_NAMES);

function without(values: Iterable<string>, remove: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const v of values) if (!remove.has(v)) out.add(v);
  return out;
}

/** Percent figures ("5%" fat) change what a product is; "5%" and "5.0%" are equal. */
function percentTokens(text: string, key: string | null): Set<string> {
  const implied = key === null ? [] : (IMPLIED_PERCENTS[key] ?? []);
  return new Set(
    (text.match(PERCENT_RE) ?? [])
      .map((t) => `${Number(t.slice(0, -1))}%`)
      .filter((t) => !NOISE_PERCENTS.has(t) && !implied.includes(t))
  );
}

function isAmbiguousName(name: string): boolean {
  return AMBIGUOUS_NAME_SET.has(tokenize(name).filter((t) => !isNoiseToken(t)).join(" "));
}

/** The last meaningful stem before the first connector word ("orange juice with bits" → juice). */
function headStem(name: string): string | undefined {
  const tokens = tokenize(name);
  const connector = tokens.findIndex((t) => CONNECTOR_WORDS.has(t));
  const beforeConnector = connector > 0 ? meaningfulStems(tokens.slice(0, connector).join(" ")) : [];
  const stems = beforeConnector.length > 0 ? beforeConnector : meaningfulStems(name);
  return stems[stems.length - 1];
}

function measureAmount(m: Measure): number {
  switch (m.kind) {
    case "mass":
      return m.grams;
    case "volume":
      return m.ml;
    case "count":
      return m.count;
  }
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const v of a) if (b.has(v)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

/** Jaccard overlap of identity words (qualifiers are compared separately). */
function tokenScore(itemName: string, product: CatalogProduct): number {
  const brandStems = new Set(product.brand ? tokenize(product.brand).map(stemToken) : []);
  const itemStems = new Set(meaningfulStems(itemName));
  const names = [product.productName, ...(getCanonicalProduct(product.productKey)?.names ?? [])];
  let best = 0;
  for (const name of names) {
    const nameStems = new Set(meaningfulStems(name).filter((s) => !brandStems.has(s)));
    best = Math.max(best, jaccard(itemStems, nameStems));
  }
  return best;
}

interface SizeFit {
  multiplier: number;
  sameKind: boolean;
  exact: boolean;
  /** A count was asked for a weight-sold product; packs estimated from typical item weight. */
  estimated: boolean;
}

/** Packs needed to cover `wanted`; null when more than MAX_QUANTITY_MULTIPLIER. */
function packsFor(wanted: number, have: number): number | null {
  const multiplier = Math.max(1, Math.ceil(wanted / have - RATIO_EPSILON));
  return multiplier > MAX_QUANTITY_MULTIPLIER ? null : multiplier;
}

/**
 * Null when the candidate can't honestly cover the wanted amount: more than
 * MAX_QUANTITY_MULTIPLIER packs, or a count asked of a weight/volume product
 * with no typical item weight.
 */
function sizeFit(itemMeasure: Measure | null, product: CatalogProduct): SizeFit | null {
  if (itemMeasure === null) {
    return { multiplier: 1, sameKind: false, exact: true, estimated: false };
  }
  const productMeasure = parseSize(product.size);
  if (productMeasure === null) {
    return { multiplier: 1, sameKind: false, exact: false, estimated: false };
  }
  if (productMeasure.kind !== itemMeasure.kind) {
    if (itemMeasure.kind !== "count") {
      return { multiplier: 1, sameKind: false, exact: false, estimated: false };
    }
    const itemGrams = APPROX_ITEM_GRAMS.get(product.productKey);
    if (productMeasure.kind !== "mass" || itemGrams === undefined || !(productMeasure.grams > 0)) {
      return null;
    }
    const multiplier = packsFor(itemMeasure.count * itemGrams, productMeasure.grams);
    return multiplier === null ? null : { multiplier, sameKind: false, exact: false, estimated: true };
  }
  const wanted = measureAmount(itemMeasure);
  const have = measureAmount(productMeasure);
  if (!(have > 0) || !(wanted > 0)) {
    return { multiplier: 1, sameKind: true, exact: false, estimated: false };
  }
  const multiplier = packsFor(wanted, have);
  if (multiplier === null) return null;
  const exact = Math.abs(wanted / have - 1) <= RATIO_EPSILON;
  return { multiplier, sameKind: true, exact, estimated: false };
}

/**
 * Finds the best catalog product for a shopping item. Never matches across
 * canonical keys, material qualifiers ("oat milk" vs "milk") or percent
 * figures ("20% fat" vs "5% fat"), never returns unavailable products, never
 * under-supplies, and returns null rather than guessing.
 */
export function matchItem(
  item: ShoppingItem,
  candidates: readonly CatalogProduct[],
  opts: MatchOptions
): MatchResult | null {
  if (isAmbiguousName(item.name)) return null;

  const canon = canonicalise(item.name);
  const itemMeasure = item.size ? parseSize(item.size.replace(/×/g, "x")) : null;
  const itemPercents = percentTokens(item.name, canon.key);
  const itemHead = headStem(item.name);
  const scored: Scored[] = [];

  for (const product of candidates) {
    if (!product.available) continue;
    if (itemPercents.size > 0 && !sameSet(itemPercents, percentTokens(product.productName, canon.key))) {
      continue;
    }
    // Only material qualifiers (e.g. "oat", "organic") participate in the
    // equality check — descriptive/non-material catalog words ("salted",
    // "basmati") are ignored so extra descriptive words never reject an
    // otherwise-matching candidate.
    const candidateQualifiers = product.qualifiers
      .map(normaliseQualifier)
      .filter((q) => MATERIAL_QUALIFIER_SET.has(q));

    let baseConfidence: number;
    if (canon.key !== null) {
      if (product.productKey !== canon.key) continue;
      const intrinsic = new Set(intrinsicQualifiers(canon.key));
      if (!sameSet(without(canon.qualifiers, intrinsic), without(candidateQualifiers, intrinsic))) {
        continue;
      }
      baseConfidence = CONFIDENCE_EXACT;
    } else {
      const candidateAll = new Set([
        ...candidateQualifiers,
        ...intrinsicQualifiers(product.productKey),
      ]);
      if (!sameSet(new Set(canon.qualifiers), candidateAll)) continue;
      // The item's head noun must name the product: "chocolate milk" is milk.
      if (itemHead === undefined || !meaningfulStems(product.productName).includes(itemHead)) {
        continue;
      }
      const score = tokenScore(item.name, product);
      if (score < MIN_TOKEN_SCORE) continue;
      baseConfidence = Math.min(CONFIDENCE_TOKEN_CAP, Math.floor(score * 100) / 100);
    }

    const fit = sizeFit(itemMeasure, product);
    if (fit === null) continue;
    let confidence =
      canon.key !== null && !fit.exact ? CONFIDENCE_SIZE_DIFFERS : baseConfidence;
    if (fit.estimated) confidence = Math.min(confidence, CONFIDENCE_QTY_APPROX);
    if (confidence < MIN_CONFIDENCE) continue;

    scored.push({
      product,
      confidence,
      quantityMultiplier: fit.multiplier,
      quantityEstimated: fit.estimated,
      sameMeasureKind: fit.sameKind,
      effectivePriceMinor: mulMinor(product.priceMinor, fit.multiplier),
    });
  }

  if (scored.length === 0) return null;

  const pool =
    itemMeasure !== null && scored.some((s) => s.sameMeasureKind)
      ? scored.filter((s) => s.sameMeasureKind)
      : scored;

  const byId = (a: Scored, b: Scored): number =>
    a.product.productId < b.product.productId ? -1 : a.product.productId > b.product.productId ? 1 : 0;

  const sorted = [...pool].sort((a, b) => {
    if (opts.mode === "closest-match") {
      return (
        b.confidence - a.confidence ||
        a.effectivePriceMinor - b.effectivePriceMinor ||
        byId(a, b)
      );
    }
    // 'cheapest' and 'own-brand-ok' (own brand is always allowed in the MVP).
    return (
      a.effectivePriceMinor - b.effectivePriceMinor ||
      b.confidence - a.confidence ||
      byId(a, b)
    );
  });

  const best = sorted[0];
  if (best === undefined) return null;
  return {
    product: best.product,
    confidence: best.confidence,
    quantityMultiplier: best.quantityMultiplier,
    ...(best.quantityEstimated ? { quantityEstimated: true } : {}),
  };
}
