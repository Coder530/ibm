import { NextResponse } from "next/server";
import type { GeocodeResponse } from "@/types/api";
import { geocodeRequestSchema } from "@/lib/validation/schemas";
import { geocodePostcode, reverseGeocode } from "@/lib/location/geocode";
import { clientIp } from "@/lib/http/clientIp";
import { readJsonBody } from "@/lib/http/readJsonBody";
import { createRateLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
const MAX_BODY_BYTES = 2_000;

const limiter = createRateLimiter({ capacity: 20, refillPerSec: 0.5 });

function statusForResponse(body: GeocodeResponse): number {
  if (body.ok) return 200;
  switch (body.code) {
    case "bad_request":
    case "invalid_postcode":
      return 400;
    case "not_found":
      return 404;
    case "upstream_error":
      return 502;
    case "rate_limited":
      return 429;
  }
}

/**
 * Resolves a UK postcode or coordinate pair to an approximate area.
 * Coordinates arrive in the POST body only and are never logged (P5).
 */
export async function POST(request: Request): Promise<NextResponse<GeocodeResponse>> {
  if (!limiter.take(clientIp(request))) {
    const body: GeocodeResponse = {
      ok: false,
      code: "rate_limited",
      message: "Too many requests. Please slow down.",
    };
    return NextResponse.json(body, { status: statusForResponse(body), headers: NO_STORE_HEADERS });
  }

  const parsedBody = await readJsonBody(request, MAX_BODY_BYTES);
  if (!parsedBody.ok) {
    if (parsedBody.reason === "too_large") {
      const body: GeocodeResponse = {
        ok: false,
        code: "bad_request",
        message: "Request body is too large.",
      };
      return NextResponse.json(body, { status: 413, headers: NO_STORE_HEADERS });
    }
    const body: GeocodeResponse = {
      ok: false,
      code: "bad_request",
      message: "Request body must be valid JSON.",
    };
    return NextResponse.json(body, { status: 400, headers: NO_STORE_HEADERS });
  }

  const parsed = geocodeRequestSchema.safeParse(parsedBody.value);
  if (!parsed.success) {
    const body: GeocodeResponse = {
      ok: false,
      code: "bad_request",
      message: "Request body must be either { postcode } or { latitude, longitude }.",
    };
    return NextResponse.json(body, { status: 400, headers: NO_STORE_HEADERS });
  }

  const result: GeocodeResponse =
    "postcode" in parsed.data
      ? await geocodePostcode(parsed.data.postcode)
      : await reverseGeocode(parsed.data.latitude, parsed.data.longitude);

  return NextResponse.json(result, {
    status: statusForResponse(result),
    headers: NO_STORE_HEADERS,
  });
}
