/**
 * Simple in-memory token-bucket rate limiter, per-instance and best-effort:
 * on serverless (multiple instances, cold starts) this does not enforce a
 * durable global limit — it's a cheap abuse guard layered in front of the
 * real per-request validation, not a security boundary on its own.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export function createRateLimiter(opts: {
  capacity: number;
  refillPerSec: number;
  now?: () => number;
  maxKeys?: number;
}): { take(key: string): boolean } {
  const { capacity, refillPerSec } = opts;
  const now = opts.now ?? Date.now;
  const maxKeys = opts.maxKeys ?? 5000;

  // Map iteration order == insertion order; re-inserting on access turns
  // this into a simple LRU so eviction drops the least-recently-used key.
  const buckets = new Map<string, Bucket>();

  function refill(bucket: Bucket, t: number): void {
    const elapsedSec = (t - bucket.lastRefill) / 1000;
    if (elapsedSec <= 0) return;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec);
    bucket.lastRefill = t;
  }

  return {
    take(key: string): boolean {
      const t = now();
      let bucket = buckets.get(key);
      if (bucket) {
        buckets.delete(key);
      } else {
        bucket = { tokens: capacity, lastRefill: t };
      }
      refill(bucket, t);

      let allowed = false;
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        allowed = true;
      }

      buckets.set(key, bucket);
      if (buckets.size > maxKeys) {
        const oldestKey = buckets.keys().next().value;
        if (oldestKey !== undefined) buckets.delete(oldestKey);
      }

      return allowed;
    },
  };
}
