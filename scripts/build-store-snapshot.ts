/**
 * Builds the bundled fallback store snapshot from a full-GB Overpass query.
 * Run with: npx tsx scripts/build-store-snapshot.ts [--out data/stores/uk-supermarkets.json]
 *
 * Not run as part of this spec — the orchestrator runs it separately, once
 * the scaffold has landed.
 */
import { resolve } from "node:path";
import { statSync, writeFileSync } from "node:fs";
import { OVERPASS_MIRRORS } from "@/lib/stores/overpass";
import { matchRetailer } from "@/lib/stores/brandMatch";
import type { RetailerId } from "@/types/retailers";
import type { StoreSnapshot } from "@/lib/stores/snapshot";

const USER_AGENT = "ReceiptGroceryOptimizer/0.1 (+https://github.com/Coder530/ibm)";
const TIMEOUT_MS = 180_000;
const QUERY =
  '[out:json][timeout:170];area["ISO3166-1"="GB"]->.gb;nwr["shop"~"^(supermarket|convenience|frozen_food)$"]["brand"](area.gb);out center tags;';

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function addressFromTags(tags: Record<string, string>): string {
  const line1 = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const line2 = [tags["addr:city"], tags["addr:postcode"]].filter(Boolean).join(" ");
  const combined = [line1, line2].filter(Boolean).join(", ");
  return combined || tags.name || "";
}

async function fetchMirror(mirror: string): Promise<OverpassElement[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(mirror, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `data=${encodeURIComponent(QUERY)}`,
      signal: controller.signal,
    });

    if (response.status !== 200) {
      throw new Error(`Overpass mirror ${mirror} returned status ${response.status}`);
    }

    const body = (await response.json()) as { elements?: OverpassElement[] };
    if (!Array.isArray(body.elements)) {
      throw new Error(`Overpass mirror ${mirror} returned an unexpected JSON shape`);
    }
    return body.elements;
  } finally {
    clearTimeout(timer);
  }
}

function parseOutPath(): string {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  if (outIndex !== -1 && args[outIndex + 1]) {
    return args[outIndex + 1]!;
  }
  return "data/stores/uk-supermarkets.json";
}

async function main(): Promise<void> {
  const outPath = resolve(process.cwd(), parseOutPath());

  console.log(
    `Querying Overpass for GB supermarkets/convenience stores (racing ${OVERPASS_MIRRORS.length} mirrors, up to ${TIMEOUT_MS / 1000}s each)...`
  );

  const elements = await Promise.any(OVERPASS_MIRRORS.map((mirror) => fetchMirror(mirror)));

  const rows: StoreSnapshot["rows"] = [];
  const seenIds = new Set<string>();

  for (const el of elements) {
    const tags = el.tags ?? {};
    const retailerId: RetailerId | null = matchRetailer(tags);
    if (!retailerId) continue;

    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;

    const id = `${el.type}/${el.id}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    rows.push([
      id,
      retailerId,
      Math.round(lat * 1e5) / 1e5,
      Math.round(lon * 1e5) / 1e5,
      tags.name ?? "",
      addressFromTags(tags),
    ]);
  }

  const snapshot: StoreSnapshot = {
    snapshotDate: new Date().toISOString().slice(0, 10),
    attribution: "© OpenStreetMap contributors, ODbL",
    rows,
  };

  writeFileSync(outPath, JSON.stringify(snapshot));

  const { size } = statSync(outPath);
  console.log(`Wrote ${rows.length} rows to ${outPath} (${(size / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error("Failed to build store snapshot:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
