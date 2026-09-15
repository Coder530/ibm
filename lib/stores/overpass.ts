import type { RetailerId, StoreLocation } from "@/types/retailers";
import { RETAILERS } from "@/types/retailers";
import { haversineMeters } from "@/lib/location/geo";
import { matchRetailer } from "./brandMatch";
import { StoreDiscoveryError } from "./findStores";

const DEFAULT_MIRRORS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
] as const;

const USER_AGENT = "ReceiptGroceryOptimizer/0.1 (+https://github.com/Coder530/ibm)";
const DEFAULT_TIMEOUT_MS = 6000;

export const OVERPASS_MIRRORS: readonly string[] = process.env.OVERPASS_MIRRORS
  ? process.env.OVERPASS_MIRRORS.split(",")
      .map((m) => m.trim())
      .filter(Boolean)
  : DEFAULT_MIRRORS;

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponseBody {
  elements: OverpassElement[];
}

function isOverpassResponseBody(body: unknown): body is OverpassResponseBody {
  return (
    typeof body === "object" &&
    body !== null &&
    Array.isArray((body as { elements?: unknown }).elements)
  );
}

// Some Overpass mirrors return HTTP 200 with a partial/degraded response
// (e.g. a timed-out or memory-exhausted query) that still carries a valid
// `elements` array — just an incomplete/untrustworthy one. Treat a `remark`
// matching this pattern as a failed mirror even though the shape otherwise
// looks fine.
const FAILURE_REMARK_PATTERN = /error|timeout|timed out|out of memory|too busy|rate.?limit|quota/i;

function hasFailureRemark(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const remark = (body as { remark?: unknown }).remark;
  return typeof remark === "string" && FAILURE_REMARK_PATTERN.test(remark);
}

function buildQuery(lat: number, lng: number, radiusMeters: number): string {
  return `[out:json][timeout:10];nwr["shop"~"^(supermarket|convenience|frozen_food)$"](around:${radiusMeters},${lat},${lng});out center tags;`;
}

async function fetchMirror(
  mirror: string,
  query: string,
  fetchImpl: typeof fetch,
  controller: AbortController,
  timeoutMs: number
): Promise<OverpassElement[]> {
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(mirror, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

    if (response.status !== 200) {
      throw new Error(`Overpass mirror ${mirror} returned status ${response.status}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error(`Overpass mirror ${mirror} returned a non-JSON body`);
    }

    if (hasFailureRemark(body)) {
      throw new Error(`Overpass mirror ${mirror} returned a failure remark`);
    }

    if (!isOverpassResponseBody(body)) {
      throw new Error(`Overpass mirror ${mirror} returned an unexpected JSON shape`);
    }

    return body.elements;
  } finally {
    clearTimeout(timer);
  }
}

function addressFromTags(tags: Record<string, string>): string {
  const line1 = [tags["addr:housenumber"], tags["addr:street"]]
    .filter(Boolean)
    .join(" ");
  const line2 = [tags["addr:city"], tags["addr:postcode"]].filter(Boolean).join(" ");
  const combined = [line1, line2].filter(Boolean).join(", ");
  return combined || tags.name || "";
}

function mapElements(
  elements: OverpassElement[],
  originLat: number,
  originLng: number
): StoreLocation[] {
  const byId = new Map<string, StoreLocation>();

  for (const el of elements) {
    const tags = el.tags ?? {};
    const retailerId: RetailerId | null = matchRetailer(tags);
    if (!retailerId) continue;

    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;

    const id = `${el.type}/${el.id}`;
    byId.set(id, {
      id,
      retailerId,
      name: tags.name ?? RETAILERS[retailerId].name,
      latitude: lat,
      longitude: lon,
      address: addressFromTags(tags),
      distanceMeters: haversineMeters(originLat, originLng, lat, lon),
    });
  }

  return Array.from(byId.values()).sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/**
 * Queries the Overpass API for nearby supermarkets/convenience stores,
 * racing all mirrors and taking the first valid response (P6: server-only —
 * never import this module from client code).
 */
export async function queryOverpassStores(
  lat: number,
  lng: number,
  radiusMeters: number,
  opts?: { fetchImpl?: typeof fetch; mirrors?: readonly string[]; timeoutMs?: number }
): Promise<StoreLocation[]> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const mirrors = opts?.mirrors ?? OVERPASS_MIRRORS;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const query = buildQuery(lat, lng, radiusMeters);

  const controllers = mirrors.map(() => new AbortController());

  try {
    const elements = await Promise.any(
      mirrors.map((mirror, i) =>
        fetchMirror(mirror, query, fetchImpl, controllers[i]!, timeoutMs)
      )
    );
    return mapElements(elements, lat, lng);
  } catch {
    throw new StoreDiscoveryError("stores_unavailable");
  } finally {
    for (const controller of controllers) {
      if (!controller.signal.aborted) controller.abort();
    }
  }
}
