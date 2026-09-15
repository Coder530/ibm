export type ReadJsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "too_large" | "invalid_json" };

/**
 * Reads and JSON-parses a request body without ever buffering more than
 * `maxBytes`. Checks Content-Length first (cheap, avoids reading anything
 * for an obviously oversized request); when that header is absent or lying,
 * falls back to summing chunk sizes as they stream in and cancels the
 * reader the moment the running total exceeds the limit.
 */
export async function readJsonBody(
  request: Request,
  maxBytes: number
): Promise<ReadJsonBodyResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      return { ok: false, reason: "too_large" };
    }
  }

  const body = request.body;
  if (!body) {
    return { ok: false, reason: "invalid_json" };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    let result: ReadableStreamReadResult<Uint8Array>;
    try {
      result = await reader.read();
    } catch {
      return { ok: false, reason: "invalid_json" };
    }
    if (result.done) break;

    const chunk = result.value;
    if (!chunk) continue;
    total += chunk.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, reason: "too_large" };
    }
    chunks.push(chunk);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8").decode(bytes);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}
