import { createHash } from "node:crypto";
import type { CompareEvent } from "@/types/api";
import { compareRequestSchema } from "@/lib/validation/schemas";
import { runCompare, type CompareRequest } from "@/lib/compare/runCompare";
import { createRateLimiter } from "@/lib/rateLimit";
import { clientIp } from "@/lib/http/clientIp";
import { readJsonBody } from "@/lib/http/readJsonBody";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BODY_BYTES = 64_000;
const DEDUPE_TTL_MS = 10_000;
const DEDUPE_MAX_ENTRIES = 200;

const limiter = createRateLimiter({ capacity: 10, refillPerSec: 0.2 });

interface DedupeEntry {
  promise: Promise<CompareEvent[]>;
  resolve: (events: CompareEvent[]) => void;
  // An entry is "in flight" until resolved, and must be reused regardless
  // of age while in flight (A4) — expiresAt is only meaningful once
  // resolved is true.
  resolved: boolean;
  expiresAt: number;
}

// Per-instance, bounded — identical requests (by canonical body hash) within
// a short window share one computation instead of re-querying retailers.
// Not a durable/cross-instance cache (best-effort, same caveat as rateLimit).
const dedupeCache = new Map<string, DedupeEntry>();

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function requestHash(data: CompareRequest): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(data))).digest("hex");
}

function errorEvent(
  code: Extract<CompareEvent, { type: "error" }>["code"],
  message: string
): CompareEvent {
  return { type: "error", code, message };
}

function jsonEventResponse(event: CompareEvent, status: number): Response {
  return new Response(JSON.stringify(event), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function newDedupeEntry(): DedupeEntry {
  let resolveFn!: (events: CompareEvent[]) => void;
  const promise = new Promise<CompareEvent[]>((res) => {
    resolveFn = res;
  });
  const entry: DedupeEntry = {
    promise,
    resolved: false,
    expiresAt: 0,
    resolve: (events: CompareEvent[]) => {
      entry.resolved = true;
      entry.expiresAt = Date.now() + DEDUPE_TTL_MS;
      resolveFn(events);
    },
  };
  return entry;
}

function getDedupeEntry(hash: string): { entry: DedupeEntry; isNew: boolean } {
  const now = Date.now();
  const existing = dedupeCache.get(hash);
  // In flight (unresolved) entries are always reused, however old (A4).
  // A resolved entry is reused only until its post-resolve TTL expires.
  if (existing && (!existing.resolved || existing.expiresAt > now)) {
    return { entry: existing, isNew: false };
  }

  const entry = newDedupeEntry();

  // Bound the cache: evict the oldest RESOLVED entry first, never an
  // in-flight one. If every entry is in flight, don't cache the new one —
  // just run it standalone (A4).
  if (existing === undefined && dedupeCache.size >= DEDUPE_MAX_ENTRIES) {
    let evictKey: string | undefined;
    for (const [key, candidate] of dedupeCache) {
      if (candidate.resolved) {
        evictKey = key;
        break;
      }
    }
    if (evictKey !== undefined) {
      dedupeCache.delete(evictKey);
    } else {
      return { entry, isNew: true };
    }
  }

  dedupeCache.set(hash, entry);
  return { entry, isNew: true };
}

/**
 * Streams basket comparison progress as newline-delimited JSON CompareEvents
 * (P5: the only place coordinates leave the client — via the POST body only,
 * never logged; P6: the only route that reaches store discovery/adapters).
 */
export async function POST(request: Request): Promise<Response> {
  if (!limiter.take(clientIp(request))) {
    return jsonEventResponse(errorEvent("rate_limited", "Too many requests. Please slow down."), 429);
  }

  const parsedBody = await readJsonBody(request, MAX_BODY_BYTES);
  if (!parsedBody.ok) {
    if (parsedBody.reason === "too_large") {
      return jsonEventResponse(errorEvent("bad_request", "Request body is too large."), 413);
    }
    return jsonEventResponse(errorEvent("bad_request", "Request body must be valid JSON."), 400);
  }

  const parsed = compareRequestSchema.safeParse(parsedBody.value);
  if (!parsed.success) {
    return jsonEventResponse(errorEvent("bad_request", "Request body failed validation."), 400);
  }

  const req: CompareRequest = parsed.data;
  const hash = requestHash(req);
  const { entry, isNew } = getDedupeEntry(hash);

  const encoder = new TextEncoder();
  // Shared between start() and cancel() below: once the client disconnects
  // we stop writing to the (now-closed) controller, but for a NEW dedupe
  // entry we keep draining runCompare into `events` regardless, so
  // entry.resolve(events) always hands any follower a complete list ending
  // in a 'result' or 'error' event (A1/A1b).
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeWrite = (event: CompareEvent): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // Controller already closed/errored (e.g. a cancel that raced
          // this write) — treat as closed and never throw out of start().
          closed = true;
        }
      };

      const safeClose = (): void => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed/errored — nothing to do.
        }
      };

      try {
        if (isNew) {
          const events: CompareEvent[] = [];
          try {
            for await (const event of runCompare(req)) {
              events.push(event);
              safeWrite(event);
            }
          } catch (err) {
            console.error("compare route: stream failed", err);
            const failure = errorEvent("internal", "Something went wrong comparing prices.");
            events.push(failure);
            safeWrite(failure);
          } finally {
            // Always resolve with a complete, terminal-ended list — even if
            // the client cancelled mid-stream — so anything deduped onto
            // this entry gets the full result instead of hanging (A1/A1b).
            entry.resolve(events);
          }
        } else {
          let events: CompareEvent[];
          try {
            events = await entry.promise;
          } catch (err) {
            // entry.resolve() is always called (see above), so this
            // shouldn't happen — guard defensively rather than hang.
            console.error("compare route: dedupe entry failed", err);
            events = [errorEvent("internal", "Something went wrong comparing prices.")];
          }
          for (const event of events) safeWrite(event);
        }
      } finally {
        safeClose();
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
