import type { CompareEvent } from "@/types/api";
import type { Preferences } from "@/types/optimization";
import type { ShoppingItem } from "@/types/shopping";

export interface CompareRequestBody {
  latitude: number;
  longitude: number;
  items: ShoppingItem[];
  prefs: Preferences;
}

export interface StreamCompareOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

function parseLine(line: string): CompareEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as CompareEvent;
  } catch {
    return { type: "error", code: "internal", message: "Received malformed data from the server." };
  }
}

/**
 * Streams `/api/compare` and yields typed CompareEvents.
 *
 * The route responds with newline-delimited JSON for a successful run, or a
 * single JSON object (no trailing newline) for a 4xx/5xx failure — this
 * parses both the same way: split on "\n" as chunks arrive, then parse any
 * leftover buffer once the stream ends. A network failure (fetch itself
 * throwing, e.g. offline) yields a typed "internal" error rather than
 * throwing, so callers only ever branch on CompareEvent.
 *
 * If the stream closes without ever yielding a "result" or "error" event
 * (the connection was cut mid-flight, the server crashed without writing a
 * final line, …) this yields one synthetic "internal" error as the last
 * event, UNLESS the caller aborted the request — an abort is an intentional
 * stop, not a failure the caller needs to be told about.
 *
 * P6: this is the only place in the client that calls `/api/compare`.
 */
export async function* streamCompare(
  body: CompareRequestBody,
  opts?: StreamCompareOptions
): AsyncGenerator<CompareEvent> {
  let sawTerminalEvent = false;
  for await (const event of streamCompareRaw(body, opts)) {
    if (event.type === "result" || event.type === "error") sawTerminalEvent = true;
    yield event;
  }
  if (!sawTerminalEvent && !opts?.signal?.aborted) {
    yield {
      type: "error",
      code: "internal",
      message: "The comparison stopped before it finished. Try again.",
    };
  }
}

async function* streamCompareRaw(
  body: CompareRequestBody,
  opts?: StreamCompareOptions
): AsyncGenerator<CompareEvent> {
  const requestInit: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: opts?.signal,
  };

  let response: Response;
  try {
    // Default path calls the real endpoint directly; tests substitute
    // `opts.fetchImpl` to control the response without a network call.
    response = opts?.fetchImpl
      ? await opts.fetchImpl("/api/compare", requestInit)
      : await fetch("/api/compare", requestInit);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    yield {
      type: "error",
      code: "internal",
      message: "Couldn't reach the server. Check your connection and try again.",
    };
    return;
  }

  if (!response.body) {
    yield { type: "error", code: "internal", message: "The server sent an empty response." };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        yield {
          type: "error",
          code: "internal",
          message: "The connection dropped while comparing prices.",
        };
        return;
      }

      const { value, done } = chunk;
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const event = parseLine(buffer.slice(0, newlineIndex));
          buffer = buffer.slice(newlineIndex + 1);
          if (event) yield event;
          newlineIndex = buffer.indexOf("\n");
        }
      }
      if (done) break;
    }

    buffer += decoder.decode();
    const trailing = parseLine(buffer);
    if (trailing) yield trailing;
  } finally {
    reader.releaseLock();
  }
}
