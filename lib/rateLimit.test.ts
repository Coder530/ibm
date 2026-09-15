import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rateLimit";

describe("createRateLimiter", () => {
  it("allows up to capacity takes, then blocks the next one", () => {
    let now = 0;
    const limiter = createRateLimiter({ capacity: 10, refillPerSec: 0.2, now: () => now });

    for (let i = 0; i < 10; i++) {
      expect(limiter.take("a")).toBe(true);
    }
    expect(limiter.take("a")).toBe(false);
  });

  it("refills tokens after the injected clock advances", () => {
    let now = 0;
    const limiter = createRateLimiter({ capacity: 10, refillPerSec: 0.2, now: () => now });

    for (let i = 0; i < 10; i++) limiter.take("a");
    expect(limiter.take("a")).toBe(false);

    now += 5_000; // 5s * 0.2/s = 1 token refilled
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(false);
  });

  it("tracks keys independently", () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerSec: 0, now: () => 0 });
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(false);
    expect(limiter.take("b")).toBe(true);
  });

  it("evicts the least-recently-used key once maxKeys is exceeded", () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerSec: 0, now: () => 0, maxKeys: 2 });

    limiter.take("a"); // a's single token is now spent
    expect(limiter.take("a")).toBe(false);

    limiter.take("b");
    limiter.take("c"); // pushes size to 3 > maxKeys(2) -> evicts "a" (oldest)

    // "a" was evicted, so it gets a fresh bucket and its token back.
    expect(limiter.take("a")).toBe(true);
  });
});
