import type { GeocodeResponse } from "@/types/api";
import { normalisePostcode } from "./postcode";

const POSTCODES_IO_BASE = "https://api.postcodes.io";
const DEFAULT_TIMEOUT_MS = 6000;

// Client-facing messages are fixed constants — never interpolate an
// upstream error's message (or the postcode/coordinates) into what the
// browser sees (S6). Server-side detail goes to console.error only, and
// even there never includes the postcode or coordinates (P5).
const UPSTREAM_ERROR_MESSAGE =
  "Couldn't reach the postcode lookup service. Please try again.";

interface PostcodesIoResult {
  postcode: string;
  latitude: number;
  longitude: number;
  admin_district: string | null;
  region: string | null;
}

interface PostcodesIoSingleResponse {
  status: number;
  result: PostcodesIoResult | null;
  error?: string;
}

interface PostcodesIoListResponse {
  status: number;
  result: PostcodesIoResult[] | null;
  error?: string;
}

function areaFromResult(result: PostcodesIoResult): string {
  return result.admin_district ?? result.region ?? "Near you";
}

/**
 * Fetches `url` with a hard timeout. Both aborts the underlying request
 * (for a well-behaved fetch implementation) AND independently rejects after
 * `timeoutMs` regardless of whether the fetch implementation honours the
 * abort signal, so a stalled call always surfaces as upstream_error rather
 * than hanging the caller.
 */
async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  let timer!: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Postcode lookup service timed out"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      fetchImpl(url, { headers: { Accept: "application/json" }, signal: controller.signal }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Looks up a UK postcode via postcodes.io. Never logs the resolved coordinates (P5). */
export async function geocodePostcode(
  postcode: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<GeocodeResponse> {
  const normalised = normalisePostcode(postcode);
  if (!normalised) {
    return { ok: false, code: "invalid_postcode", message: "Not a valid UK postcode." };
  }

  const url = `${POSTCODES_IO_BASE}/postcodes/${encodeURIComponent(normalised)}`;

  let response: Response;
  try {
    response = await fetchWithTimeout(fetchImpl, url, timeoutMs);
  } catch (err) {
    console.error("geocodePostcode: postcode lookup request failed", err);
    return { ok: false, code: "upstream_error", message: UPSTREAM_ERROR_MESSAGE };
  }

  if (response.status === 404) {
    return { ok: false, code: "not_found", message: "Postcode not found." };
  }

  if (!response.ok) {
    console.error("geocodePostcode: postcode lookup returned status", response.status);
    return { ok: false, code: "upstream_error", message: UPSTREAM_ERROR_MESSAGE };
  }

  let body: PostcodesIoSingleResponse;
  try {
    body = (await response.json()) as PostcodesIoSingleResponse;
  } catch (err) {
    console.error("geocodePostcode: failed to parse postcode lookup response", err);
    return { ok: false, code: "upstream_error", message: UPSTREAM_ERROR_MESSAGE };
  }

  if (!body.result) {
    return { ok: false, code: "not_found", message: "Postcode not found." };
  }

  return {
    ok: true,
    area: areaFromResult(body.result),
    postcode: normalised,
    latitude: body.result.latitude,
    longitude: body.result.longitude,
  };
}

/**
 * Resolves an approximate area name from coordinates via postcodes.io.
 * Falls back to `{ ok: true, postcode: null, area: "Near you" }` when no
 * postcode is found near the given point (still a success, not an error).
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<GeocodeResponse> {
  const url = `${POSTCODES_IO_BASE}/postcodes?lon=${encodeURIComponent(
    lng
  )}&lat=${encodeURIComponent(lat)}&limit=1`;

  let response: Response;
  try {
    response = await fetchWithTimeout(fetchImpl, url, timeoutMs);
  } catch (err) {
    console.error("reverseGeocode: postcode lookup request failed", err);
    return { ok: false, code: "upstream_error", message: UPSTREAM_ERROR_MESSAGE };
  }

  if (!response.ok) {
    console.error("reverseGeocode: postcode lookup returned status", response.status);
    return { ok: false, code: "upstream_error", message: UPSTREAM_ERROR_MESSAGE };
  }

  let body: PostcodesIoListResponse;
  try {
    body = (await response.json()) as PostcodesIoListResponse;
  } catch (err) {
    console.error("reverseGeocode: failed to parse postcode lookup response", err);
    return { ok: false, code: "upstream_error", message: UPSTREAM_ERROR_MESSAGE };
  }

  const first = body.result?.[0];
  if (!first) {
    return { ok: true, area: "Near you", postcode: null, latitude: lat, longitude: lng };
  }

  return {
    ok: true,
    area: areaFromResult(first),
    postcode: first.postcode,
    latitude: lat,
    longitude: lng,
  };
}
