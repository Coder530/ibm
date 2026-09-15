import { describe, expect, it } from "vitest";
import { readJsonBody } from "./readJsonBody";

function postRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/x", { method: "POST", headers, body });
}

/** A streamed body with no content-length header, so readJsonBody must rely
 * on summing chunk sizes as they arrive rather than trusting a header. */
function streamedRequest(
  chunks: string[],
  opts?: { onCancel?: (reason: unknown) => void }
): Request {
  const enc = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(enc.encode(chunks[index]));
      index += 1;
    },
    cancel(reason) {
      opts?.onCancel?.(reason);
    },
  });
  return new Request("http://localhost/api/x", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit);
}

describe("readJsonBody", () => {
  it("parses a small valid JSON body", async () => {
    const result = await readJsonBody(postRequest(JSON.stringify({ a: 1 })), 1000);
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it("returns invalid_json for a malformed body", async () => {
    const result = await readJsonBody(postRequest("{not json"), 1000);
    expect(result).toEqual({ ok: false, reason: "invalid_json" });
  });

  it("returns invalid_json when the body is null", async () => {
    const request = new Request("http://localhost/api/x", { method: "GET" });
    const result = await readJsonBody(request, 1000);
    expect(result).toEqual({ ok: false, reason: "invalid_json" });
  });

  it("returns too_large based on Content-Length alone, without calling getReader", async () => {
    let getReaderCalled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode("{}"));
        controller.close();
      },
    });
    const request = new Request("http://localhost/api/x", {
      method: "POST",
      headers: { "content-length": "5000" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    const originalGetReader = request.body!.getReader.bind(request.body);
    request.body!.getReader = ((...args: Parameters<typeof originalGetReader>) => {
      getReaderCalled = true;
      return originalGetReader(...args);
    }) as typeof originalGetReader;

    const result = await readJsonBody(request, 1000);
    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(getReaderCalled).toBe(false);
  });

  it("streams and cancels as soon as the running total exceeds maxBytes, never buffering beyond it", async () => {
    let cancelReason: unknown = "not called";
    const chunk = "x".repeat(40); // 3 chunks of 40 bytes = 120 bytes total, maxBytes = 100
    const request = streamedRequest([chunk, chunk, chunk], {
      onCancel: (reason) => {
        cancelReason = reason;
      },
    });

    const result = await readJsonBody(request, 100);
    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(cancelReason).not.toBe("not called");
  });

  it("accepts a body exactly at maxBytes", async () => {
    const json = JSON.stringify({ ok: true });
    const byteLength = new TextEncoder().encode(json).byteLength;
    const result = await readJsonBody(postRequest(json), byteLength);
    expect(result).toEqual({ ok: true, value: { ok: true } });
  });
});
