import { describe, expect, it } from "vitest";
import type { CompareEvent } from "@/types/api";
import { streamCompare, type CompareRequestBody } from "./compareClient";

const REQUEST_BODY: CompareRequestBody = {
  latitude: 51.5,
  longitude: -0.12,
  items: [{ id: "item-0", name: "milk", quantity: 1 }],
  prefs: {
    priority: "cheapest",
    maxDistanceMeters: 8000,
    maxStores: 2,
    transport: "walk",
    matchMode: "cheapest",
  },
};

function chunkedFetch(chunks: string[], status = 200): typeof fetch {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return (async () => new Response(stream, { status })) as unknown as typeof fetch;
}

describe("streamCompare", () => {
  it("parses NDJSON events even when a line is split across chunks", async () => {
    const storesEvent: CompareEvent = {
      type: "stores",
      discovery: {
        stores: [
          {
            id: "s1",
            retailerId: "tesco",
            name: "Tesco Express",
            latitude: 51.5,
            longitude: -0.12,
            address: "1 High St",
            distanceMeters: 400,
          },
        ],
        source: "overpass",
        freshness: "live",
        snapshotDate: null,
        attribution: "© OpenStreetMap contributors, ODbL",
      },
    };
    const retailerEvent: CompareEvent = {
      type: "retailer",
      retailerId: "tesco",
      status: "searching",
      matched: 0,
      total: 1,
    };
    // A real stream always ends with a terminal "result" or "error" event
    // (see U2 below) — include one so this fixture models a complete run.
    const errorEvent: CompareEvent = {
      type: "error",
      code: "no_stores",
      message: "No stores found nearby.",
    };

    const line1 = `${JSON.stringify(storesEvent)}\n`;
    const line2 = `${JSON.stringify(retailerEvent)}\n`;
    const line3 = `${JSON.stringify(errorEvent)}\n`;
    const full = line1 + line2 + line3;

    // Split mid-way through the second line, well inside its JSON body.
    const splitAt = line1.length + Math.floor(line2.length / 2);
    const chunks = [full.slice(0, splitAt), full.slice(splitAt)];

    const events: CompareEvent[] = [];
    for await (const event of streamCompare(REQUEST_BODY, { fetchImpl: chunkedFetch(chunks) })) {
      events.push(event);
    }

    expect(events).toEqual([storesEvent, retailerEvent, errorEvent]);
  });

  it("splits a chunk that lands exactly on multiple newlines", async () => {
    const e1: CompareEvent = { type: "retailer", retailerId: "aldi", status: "done", matched: 1, total: 1 };
    const e2: CompareEvent = { type: "retailer", retailerId: "lidl", status: "error", matched: 0, total: 1 };
    const e3: CompareEvent = {
      type: "error",
      code: "no_stores",
      message: "No stores found nearby.",
    };
    const full = `${JSON.stringify(e1)}\n${JSON.stringify(e2)}\n${JSON.stringify(e3)}\n`;

    const events: CompareEvent[] = [];
    for await (const event of streamCompare(REQUEST_BODY, { fetchImpl: chunkedFetch([full]) })) {
      events.push(event);
    }

    expect(events).toEqual([e1, e2, e3]);
  });

  it("yields a typed rate_limited error for a 429 response", async () => {
    const errorEvent: CompareEvent = {
      type: "error",
      code: "rate_limited",
      message: "Too many requests. Please slow down.",
    };
    // The API route sends a single JSON object with no trailing newline for 4xx/5xx.
    const fetchImpl = chunkedFetch([JSON.stringify(errorEvent)], 429);

    const events: CompareEvent[] = [];
    for await (const event of streamCompare(REQUEST_BODY, { fetchImpl })) {
      events.push(event);
    }

    expect(events).toEqual([errorEvent]);
    expect(events[0]).toMatchObject({ type: "error", code: "rate_limited" });
  });

  it("yields a typed internal error when the network request itself fails", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    const events: CompareEvent[] = [];
    for await (const event of streamCompare(REQUEST_BODY, { fetchImpl })) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", code: "internal" });
  });

  it("yields a synthetic internal error as the final event when the stream ends without a result or error", async () => {
    const storesEvent: CompareEvent = {
      type: "stores",
      discovery: {
        stores: [
          {
            id: "s1",
            retailerId: "tesco",
            name: "Tesco Express",
            latitude: 51.5,
            longitude: -0.12,
            address: "1 High St",
            distanceMeters: 400,
          },
        ],
        source: "overpass",
        freshness: "live",
        snapshotDate: null,
        attribution: "© OpenStreetMap contributors, ODbL",
      },
    };
    const retailerEvent: CompareEvent = {
      type: "retailer",
      retailerId: "tesco",
      status: "searching",
      matched: 0,
      total: 1,
    };
    // The server closes the connection early — only progress events, no
    // terminal "result" or "error" line, and no trailing newline either.
    const full = `${JSON.stringify(storesEvent)}\n${JSON.stringify(retailerEvent)}\n`;

    const events: CompareEvent[] = [];
    for await (const event of streamCompare(REQUEST_BODY, { fetchImpl: chunkedFetch([full]) })) {
      events.push(event);
    }

    expect(events).toEqual([
      storesEvent,
      retailerEvent,
      {
        type: "error",
        code: "internal",
        message: "The comparison stopped before it finished. Try again.",
      },
    ]);
    expect(events[events.length - 1]).toMatchObject({ type: "error" });
  });

  it("yields no synthetic error when the stream ends because the caller aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = (async () => {
      throw new DOMException("The user aborted a request.", "AbortError");
    }) as unknown as typeof fetch;

    const events: CompareEvent[] = [];
    for await (const event of streamCompare(REQUEST_BODY, { fetchImpl, signal: controller.signal })) {
      events.push(event);
    }

    expect(events).toEqual([]);
  });
});
