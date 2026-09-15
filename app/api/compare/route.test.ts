import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompareEvent } from "@/types/api";

const runCompareMock = vi.fn<(...args: unknown[]) => AsyncGenerator<CompareEvent>>();

vi.mock("@/lib/compare/runCompare", () => ({
  runCompare: (...args: unknown[]) => runCompareMock(...args),
}));

const { POST } = await import("./route");

const VALID_BODY = {
  latitude: 51.5,
  longitude: -0.12,
  items: [{ id: "i1", name: "milk", quantity: 1 }],
  prefs: {
    priority: "cheapest",
    maxDistanceMeters: 2000,
    maxStores: 2,
    transport: "walk",
    matchMode: "cheapest",
  },
};

function postRequest(body: unknown, headers: Record<string, string> = {}): Request {
  const json = JSON.stringify(body);
  return new Request("http://localhost/api/compare", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: json,
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const STORES_EVENT: CompareEvent = {
  type: "stores",
  discovery: {
    stores: [],
    source: "overpass",
    freshness: "live",
    snapshotDate: null,
    attribution: "test",
  },
};

const RESULT_EVENT: CompareEvent = {
  type: "result",
  result: { recommended: null, alternatives: [], explanation: "", warnings: [] },
  offersFreshness: "demo",
};

const RETAILER_EVENT: CompareEvent = {
  type: "retailer",
  retailerId: "tesco",
  status: "done",
  matched: 1,
  total: 1,
};

async function* fakeEvents(): AsyncGenerator<CompareEvent> {
  yield STORES_EVENT;
  yield RESULT_EVENT;
}

async function readNdjsonLines(response: Response): Promise<string[]> {
  const text = await response.text();
  return text.split("\n").filter((line) => line.length > 0);
}

/** Flushes pending microtasks/macrotasks so a deferred `process.emit`
 * (e.g. 'unhandledRejection') has a chance to fire before we assert on it. */
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe("POST /api/compare", () => {
  afterEach(() => {
    runCompareMock.mockReset();
  });

  it("returns 400 for a malformed JSON body", async () => {
    const request = new Request("http://localhost/api/compare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ type: "error", code: "bad_request" });
  });

  it("returns 400 when the body fails schema validation", async () => {
    const response = await POST(postRequest({ foo: "bar" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ type: "error", code: "bad_request" });
  });

  it("returns 200 NDJSON whose last line parses to type 'result'", async () => {
    runCompareMock.mockReturnValue(fakeEvents());

    const response = await POST(postRequest(VALID_BODY, { "x-vercel-forwarded-for": "203.0.113.5" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");

    const lines = await readNdjsonLines(response);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const last = JSON.parse(lines[lines.length - 1] as string) as CompareEvent;
    expect(last.type).toBe("result");
  });

  it("rate-limits: an 11th rapid request from the same IP gets 429", async () => {
    runCompareMock.mockImplementation(() => fakeEvents());
    const ip = "198.51.100.9";

    let lastStatus = 200;
    for (let i = 0; i < 11; i++) {
      const response = await POST(postRequest(VALID_BODY, { "x-vercel-forwarded-for": ip }));
      lastStatus = response.status;
      if (response.body) await response.body.cancel();
    }

    expect(lastStatus).toBe(429);
  });

  it("S5: returns 413 for a body over 64KB with no content-length header", async () => {
    const oversizeBody = {
      ...VALID_BODY,
      items: [{ id: "i1", name: "x".repeat(70_000), quantity: 1 }],
    };
    const response = await POST(postRequest(oversizeBody, { "x-vercel-forwarded-for": "203.0.113.9" }));
    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body).toMatchObject({ type: "error", code: "bad_request" });
    expect(runCompareMock).not.toHaveBeenCalled();
  });

  it(
    "A1/A1b: a client cancelling after the first NDJSON line causes no unhandled rejection and no throw, " +
      "and a subsequent identical request replays a complete list ending in 'result'",
    async () => {
      const gate = deferred<void>();
      // Two events remain AFTER the cancellation point (RETAILER_EVENT,
      // then RESULT_EVENT) — this is what exposes a version that stops
      // draining the generator on the first post-cancel write failure:
      // it would lose RESULT_EVENT off the end of the resolved list.
      async function* slowThenResult(): AsyncGenerator<CompareEvent> {
        yield STORES_EVENT;
        await gate.promise;
        yield RETAILER_EVENT;
        yield RESULT_EVENT;
      }
      runCompareMock.mockImplementationOnce(() => slowThenResult());

      const unhandledRejections: unknown[] = [];
      const onUnhandledRejection = (reason: unknown): void => {
        unhandledRejections.push(reason);
      };
      process.on("unhandledRejection", onUnhandledRejection);

      try {
        const response = await POST(
          postRequest(VALID_BODY, { "x-vercel-forwarded-for": "203.0.113.10" })
        );
        expect(response.body).toBeTruthy();
        const reader = response.body!.getReader();

        // Read exactly the first NDJSON line (one write == one enqueue == one chunk).
        const first = await reader.read();
        expect(first.done).toBe(false);
        expect(new TextDecoder().decode(first.value)).toContain('"type":"stores"');

        // Cancel mid-stream, before runCompare's second event is produced.
        await expect(reader.cancel()).resolves.toBeUndefined();

        // Let the generator continue past the point where the (now
        // cancelled) consumer would previously have caused an enqueue on a
        // closed controller to throw.
        gate.resolve();
        await flushAsync();

        expect(unhandledRejections).toEqual([]);
      } finally {
        process.off("unhandledRejection", onUnhandledRejection);
      }

      // (b) A second, identical request must replay the complete event
      // list the first computation produced, ending in 'result' — proving
      // the dedupe entry resolved with a full, terminal-ended list despite
      // the first consumer cancelling.
      const response2 = await POST(
        postRequest(VALID_BODY, { "x-vercel-forwarded-for": "203.0.113.11" })
      );
      expect(response2.status).toBe(200);
      const lines = await readNdjsonLines(response2);
      expect(lines.length).toBeGreaterThanOrEqual(2);
      const last = JSON.parse(lines[lines.length - 1] as string) as CompareEvent;
      expect(last.type).toBe("result");
    }
  );

  it("A4: a second identical request arriving after the dedupe TTL but before completion shares the in-flight run", async () => {
    vi.useFakeTimers();
    try {
      const baseTime = new Date(2030, 0, 1).getTime();
      vi.setSystemTime(baseTime);

      const gate = deferred<void>();
      async function* slowThenResult(): AsyncGenerator<CompareEvent> {
        yield STORES_EVENT;
        await gate.promise;
        yield RESULT_EVENT;
      }
      runCompareMock.mockImplementationOnce(() => slowThenResult());

      const response1 = await POST(
        postRequest(VALID_BODY, { "x-vercel-forwarded-for": "203.0.113.12" })
      );
      expect(response1.status).toBe(200);

      // Past the 10s dedupe TTL, but the first run is still in flight
      // (gate not yet resolved) — per A4 it must still be reused.
      vi.setSystemTime(baseTime + 10_001);

      const response2 = await POST(
        postRequest(VALID_BODY, { "x-vercel-forwarded-for": "203.0.113.13" })
      );
      expect(response2.status).toBe(200);

      expect(runCompareMock).toHaveBeenCalledTimes(1);

      gate.resolve();
      if (response1.body) await response1.body.cancel().catch(() => {});
      if (response2.body) await response2.body.cancel().catch(() => {});
    } finally {
      vi.useRealTimers();
    }
  });
});
