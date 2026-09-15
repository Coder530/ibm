import type { RetailerId } from "@/types/retailers";

// Ocado has no physical stores, so it is deliberately excluded here and can
// never be returned by matchRetailer.
const PATTERNS: { id: Exclude<RetailerId, "ocado">; test: RegExp[] }[] = [
  { id: "tesco", test: [/\btesco\b/i] },
  { id: "sainsburys", test: [/sainsbury'?s/i] },
  { id: "asda", test: [/\basda\b/i] },
  { id: "morrisons", test: [/\bmorrisons?\b/i] },
  { id: "aldi", test: [/\baldi\b/i] },
  { id: "lidl", test: [/\blidl\b/i] },
  { id: "waitrose", test: [/\bwaitrose\b/i] },
  {
    id: "coop",
    test: [/\bco-?op\b/i, /co-?operative(\s+food)?\b/i],
  },
  { id: "iceland", test: [/\biceland\b/i] },
  {
    id: "mands",
    test: [/\bm\s*&\s*s\b/i, /marks\s*(?:&|and)\s*spencer/i],
  },
];

/**
 * Maps OSM tags (brand, brand:wikidata, name, operator) to one of our
 * supported RetailerIds, or null when no supported retailer matches.
 */
export function matchRetailer(tags: Record<string, string>): RetailerId | null {
  const haystack = [tags.brand, tags["brand:wikidata"], tags.name, tags.operator]
    .filter((v): v is string => Boolean(v))
    .join(" ");

  if (!haystack) return null;

  for (const { id, test } of PATTERNS) {
    if (test.some((re) => re.test(haystack))) {
      return id;
    }
  }

  return null;
}
