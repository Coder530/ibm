import type { ShoppingItem } from "@/types/shopping";
import { LIMITS } from "@/lib/validation/schemas";
import { parseSize } from "@/lib/units/parseSize";
import { canonicalise, COUNTABLE_KEYS } from "./synonyms";

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 99;

const BULLET_RE = /^(?:[-*•]\s+|\[\s*[xX✓]?\s*\]\s*)/;
// "20 %", "20percent" → "20%": a percentage is part of the name, never a quantity.
const PERCENT_FORM_RE = /(\d+(?:\.\d+)?)\s*(?:%|percent\b)/gi;
const UNIT_PATTERN = "(?:kg|g|ml|cl|l|litres?|liters?|pints?|pt|pack|pk)";
const SIZE_CORE = `\\d+(?:\\.\\d+)?\\s*(?:[x×]\\s*\\d+(?:\\.\\d+)?\\s*)?${UNIT_PATTERN}`;
const LEADING_SIZE_RE = new RegExp(`^(${SIZE_CORE})(?=\\s|$)`, "i");
const ANY_SIZE_RE = new RegExp(`(?:^|\\s)(${SIZE_CORE})(?=\\s|$)`, "i");
const DOZEN_RE = /^(?:(half)\s+a\s+|(?:a|one)\s+|(\d+)\s+)?dozen\s+/i;
const LEADING_QTY_X_RE = /^(\d+)\s*[x×]\s*(?=[^\d\s])|^(\d+)\s*[x×]\s+/i;
const TRAILING_QTY_X_RE = /\s+[x×]\s*(\d+)$/i;
const LEADING_QTY_RE = /^(\d+)\s+(?=[^\d\s])/;
const LEADING_ARTICLE_RE = /^(?:a|an)\s+/i;
const CONTAINER_OF_RE =
  /^(?:bags?|loaf|loaves|tins?|cans?|bottles?|box(?:es)?|jars?|cartons?|packs?|packets?|punnets?|bunch(?:es)?|nets?|tubs?|bars?|heads?|trays?)\s+of\s+/i;
const OF_RE = /^of\s+/i;
const TIN_CONTAINER_RE = /^(?:tins?|cans?)\s/i;
const FRESH_CATEGORIES: ReadonlySet<string> = new Set(["vegetables", "fruit"]);
const EDGE_JUNK_RE = /^[^a-zA-Z0-9À-ÿ]+|[^a-zA-Z0-9À-ÿ)%]+$/g;

interface ParsedSegment {
  name: string;
  quantity: number;
  size?: string;
  /** Bare count inside a compound form: the 12 in "2x 12 eggs", the 6 in "6 eggs x2". */
  count?: number;
  /** A container phrase was stripped ("2 boxes of eggs"): the quantity counts packs. */
  container: boolean;
  /** The quantity came from an x-form ("eggs x2", "2x eggs"): it counts packs, not items. */
  xForm: boolean;
}

function normaliseSizeText(text: string): string | undefined {
  const cleaned = text.replace(/×/g, "x").replace(/\s+/g, " ").trim();
  return parseSize(cleaned) !== null ? cleaned : undefined;
}

function parseSegment(raw: string): ParsedSegment {
  let rest = raw.trim();
  for (let i = 0; i < 2; i++) rest = rest.replace(BULLET_RE, "").trim();
  rest = rest.replace(PERCENT_FORM_RE, " $1% ").replace(/\s+/g, " ").trim();

  let quantity: number | null = null;
  let size: string | undefined;
  let count: number | undefined;
  let plainLeadingQuantity = false;
  let xForm = false;

  const dozen = DOZEN_RE.exec(rest);
  if (dozen) {
    const dozenCount = dozen[1] ? 6 : dozen[2] ? Number(dozen[2]) * 12 : 12;
    size = `${dozenCount} pack`;
    rest = rest.slice(dozen[0].length);
  } else {
    const leadingSize = LEADING_SIZE_RE.exec(rest);
    if (leadingSize) {
      const s = normaliseSizeText(leadingSize[1] ?? "");
      if (s !== undefined) {
        size = s;
        rest = rest.slice(leadingSize[0].length);
      }
    }
    if (size === undefined) {
      const x = LEADING_QTY_X_RE.exec(rest);
      const plain = x ? null : LEADING_QTY_RE.exec(rest);
      if (x) {
        quantity = Number(x[1] ?? x[2]);
        xForm = true;
        rest = rest.slice(x[0].length);
      } else if (plain) {
        quantity = Number(plain[1]);
        plainLeadingQuantity = true;
        rest = rest.slice(plain[0].length);
      } else if (LEADING_ARTICLE_RE.test(rest)) {
        rest = rest.replace(LEADING_ARTICLE_RE, "");
      }
      rest = rest.trim();
      const afterQtySize = LEADING_SIZE_RE.exec(rest);
      if (afterQtySize) {
        const s = normaliseSizeText(afterQtySize[1] ?? "");
        if (s !== undefined) {
          size = s;
          rest = rest.slice(afterQtySize[0].length);
        }
      }
      if (x && size === undefined) {
        const inner = LEADING_QTY_RE.exec(rest);
        if (inner) {
          count = Number(inner[1]);
          rest = rest.slice(inner[0].length);
        }
      }
    }
  }

  rest = rest.trim();
  const trailing = TRAILING_QTY_X_RE.exec(rest);
  if (trailing) {
    if (quantity === null) {
      quantity = Number(trailing[1]);
      xForm = true;
      rest = rest.slice(0, trailing.index);
    } else if (plainLeadingQuantity) {
      // "6 eggs x2": the leading number is the count, the trailing one the packs.
      count = quantity;
      quantity = Number(trailing[1]);
      rest = rest.slice(0, trailing.index);
    }
  }

  if (size === undefined) {
    const anywhere = ANY_SIZE_RE.exec(rest);
    if (anywhere) {
      const s = normaliseSizeText(anywhere[1] ?? "");
      if (s !== undefined) {
        size = s;
        rest = `${rest.slice(0, anywhere.index)} ${rest.slice(anywhere.index + anywhere[0].length)}`;
      }
    }
  }

  rest = rest.trim();
  const containerMatch = CONTAINER_OF_RE.exec(rest);
  const container = containerMatch !== null;
  const tinned = containerMatch !== null && TIN_CONTAINER_RE.test(containerMatch[0]);
  rest = rest.replace(CONTAINER_OF_RE, "").replace(OF_RE, "").trim();
  if (container && size === undefined) {
    // "2 packs of 12 eggs": a size or count after the container describes one pack.
    const innerSize = LEADING_SIZE_RE.exec(rest);
    const innerSizeText = innerSize ? normaliseSizeText(innerSize[1] ?? "") : undefined;
    if (innerSize && innerSizeText !== undefined) {
      size = innerSizeText;
      rest = rest.slice(innerSize[0].length);
    } else {
      const inner = LEADING_QTY_RE.exec(rest);
      if (inner && Number(inner[1]) >= 1) {
        size = `${Number(inner[1])} pack`;
        rest = rest.slice(inner[0].length);
      }
    }
  }
  let name = rest.replace(/\s+/g, " ").replace(EDGE_JUNK_RE, "").trim();
  // "2 tins of tomatoes" must never match fresh produce: keep the tinned intent
  // in the name so it resolves to a tinned product ("tinned tomatoes") or stays
  // unmatched and visible, instead of silently pricing the fresh item.
  if (tinned && !/^(?:tinned|canned)\b/i.test(name)) {
    const { category } = canonicalise(name);
    if (category !== null && FRESH_CATEGORIES.has(category)) name = `tinned ${name}`;
  }

  return {
    name,
    quantity: quantity ?? 1,
    ...(size !== undefined ? { size } : {}),
    ...(count !== undefined ? { count } : {}),
    container,
    xForm,
  };
}

function looksLikeItem(segment: string): boolean {
  const { name } = parseSegment(segment);
  return name.length > 0 && canonicalise(name).key !== null;
}

function splitSegments(text: string): string[] {
  const out: string[] = [];
  for (const piece of text.split(/[\r\n,;]+/)) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+and\s+/i);
    if (parts.length > 1 && parts.every(looksLikeItem)) {
      out.push(...parts);
    } else {
      out.push(trimmed);
    }
  }
  return out;
}

function dedupeKey(name: string, size: string | undefined): string {
  return `${name.toLowerCase().replace(/\s+/g, " ")}|${(size ?? "").toLowerCase().replace(/\s+/g, "")}`;
}

function pushWarning(warnings: string[], message: string): void {
  if (!warnings.includes(message)) warnings.push(message);
}

function clampQuantity(quantity: number, name: string, warnings: string[]): number {
  if (quantity > MAX_QUANTITY) {
    pushWarning(warnings, `Quantity for ${name} limited to ${MAX_QUANTITY}`);
    return MAX_QUANTITY;
  }
  if (quantity < MIN_QUANTITY) {
    pushWarning(warnings, `Quantity for ${name} set to ${MIN_QUANTITY}`);
    return MIN_QUANTITY;
  }
  return quantity;
}

interface MergedEntry {
  name: string;
  quantity: number;
  size?: string;
  /** Bare count of a countable product, summed across duplicates; becomes the pack size. */
  count?: number;
}

/**
 * Parses free-text shopping lists into structured items. Pure and
 * deterministic: IDs derive from position only.
 */
export function parseShoppingList(
  text: string,
  opts?: { idPrefix?: string }
): { items: ShoppingItem[]; warnings: string[] } {
  const warnings: string[] = [];
  const merged: MergedEntry[] = [];
  const indexByKey = new Map<string, number>();
  // Count lines ("6 eggs") and pack lines ("eggs x2") of one product never merge; flag the pair.
  const formsByMergeKey = new Map<string, { name: string; count: boolean; pack: boolean }>();
  const noteForm = (mergeKey: string | null, form: "count" | "pack", name: string): void => {
    if (mergeKey === null) return;
    const forms = formsByMergeKey.get(mergeKey) ?? { name, count: false, pack: false };
    forms[form] = true;
    formsByMergeKey.set(mergeKey, forms);
    if (forms.count && forms.pack) {
      pushWarning(warnings, `Check quantity: ${forms.name} appears more than once`);
    }
  };

  for (const segment of splitSegments(text)) {
    const parsed = parseSegment(segment);
    if (!parsed.name) {
      pushWarning(warnings, `Couldn't find an item name in "${segment.slice(0, 40)}"`);
      continue;
    }

    let name = parsed.name;
    if (name.length > LIMITS.maxNameLength) {
      name = name.slice(0, LIMITS.maxNameLength).trimEnd();
      pushWarning(warnings, `Shortened a long item name to ${LIMITS.maxNameLength} characters: ${name}`);
    }

    let quantity = parsed.quantity;
    let size = parsed.size;
    const canon = canonicalise(name);
    const key = canon.key;
    // Material qualifiers are part of the merge key: "organic bananas" never merges with "bananas".
    const mergeKey =
      key !== null && COUNTABLE_KEYS.has(key) ? `${key}|${[...canon.qualifiers].sort().join(",")}` : null;
    const countable = size === undefined && !parsed.container && mergeKey !== null;

    // "2 boxes of eggs" and "eggs x2" count packs; only a bare count of a
    // countable product is its pack size: "6 bananas" is one item of six bananas.
    if (countable && !parsed.xForm && parsed.count === undefined) {
      noteForm(mergeKey, "count", name);
      // Duplicates sum their counts before the pack conversion ("2 eggs" + "3 eggs" = 5).
      const itemCount = quantity < MIN_QUANTITY ? clampQuantity(quantity, name, warnings) : quantity;
      const countKey = `count|${mergeKey}`;
      const existing = indexByKey.get(countKey);
      const existingItem = existing === undefined ? undefined : merged[existing];
      if (existingItem !== undefined) {
        existingItem.count = (existingItem.count ?? 0) + itemCount;
        pushWarning(warnings, `Merged duplicate: ${existingItem.name}`);
        continue;
      }
      indexByKey.set(countKey, merged.length);
      merged.push({ name, quantity: 1, count: itemCount });
      continue;
    }

    noteForm(mergeKey, "pack", name);
    // "2x 12 eggs" is two items of twelve eggs.
    if (parsed.count !== undefined) {
      if (countable && parsed.count >= 1) {
        size = `${parsed.count} pack`;
      } else {
        quantity *= parsed.count;
      }
    }
    quantity = clampQuantity(quantity, name, warnings);

    const dk = `item|${dedupeKey(name, size)}`;
    const existing = indexByKey.get(dk);
    const existingItem = existing === undefined ? undefined : merged[existing];
    if (existingItem !== undefined) {
      existingItem.quantity = clampQuantity(existingItem.quantity + quantity, existingItem.name, warnings);
      pushWarning(warnings, `Merged duplicate: ${existingItem.name}`);
      continue;
    }
    indexByKey.set(dk, merged.length);
    merged.push({ name, quantity, ...(size !== undefined ? { size } : {}) });
  }

  if (merged.length > LIMITS.maxItems) {
    pushWarning(
      warnings,
      `Your list has ${merged.length} items; only the first ${LIMITS.maxItems} were kept`
    );
  }

  const prefix = opts?.idPrefix ?? "item";
  const items: ShoppingItem[] = merged.slice(0, LIMITS.maxItems).map((entry, index) => {
    const category = canonicalise(entry.name).category;
    const size = entry.count !== undefined && entry.count >= 2 ? `${entry.count} pack` : entry.size;
    return {
      id: `${prefix}-${index}`,
      name: entry.name,
      quantity: entry.quantity,
      ...(size !== undefined ? { size } : {}),
      ...(category !== null ? { category } : {}),
    };
  });

  return { items, warnings };
}
