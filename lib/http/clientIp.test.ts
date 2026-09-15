import { describe, expect, it } from "vitest";
import { clientIp } from "./clientIp";

function requestWithHeaders(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/x", { method: "POST", headers });
}

describe("clientIp", () => {
  it("prefers x-vercel-forwarded-for over every other header", () => {
    const request = requestWithHeaders({
      "x-vercel-forwarded-for": "203.0.113.1",
      "x-real-ip": "203.0.113.2",
      "x-forwarded-for": "203.0.113.3",
    });
    expect(clientIp(request)).toBe("203.0.113.1");
  });

  it("takes only the first entry of a comma-separated x-vercel-forwarded-for", () => {
    const request = requestWithHeaders({ "x-vercel-forwarded-for": "203.0.113.1, 10.0.0.1" });
    expect(clientIp(request)).toBe("203.0.113.1");
  });

  it("falls back to x-real-ip when x-vercel-forwarded-for is absent", () => {
    const request = requestWithHeaders({
      "x-real-ip": "203.0.113.2",
      "x-forwarded-for": "203.0.113.3",
    });
    expect(clientIp(request)).toBe("203.0.113.2");
  });

  it("falls back to x-forwarded-for when neither of the above is present", () => {
    const request = requestWithHeaders({ "x-forwarded-for": "203.0.113.3, 10.0.0.1" });
    expect(clientIp(request)).toBe("203.0.113.3");
  });

  it("falls back to 'anon' when no relevant header is present", () => {
    const request = requestWithHeaders({});
    expect(clientIp(request)).toBe("anon");
  });

  it("falls back to 'anon' when the only present headers are empty strings", () => {
    const request = requestWithHeaders({
      "x-vercel-forwarded-for": "",
      "x-real-ip": "  ",
      "x-forwarded-for": ",",
    });
    expect(clientIp(request)).toBe("anon");
  });

  it("skips an empty x-vercel-forwarded-for and falls through to x-real-ip", () => {
    const request = requestWithHeaders({
      "x-vercel-forwarded-for": "",
      "x-real-ip": "203.0.113.2",
    });
    expect(clientIp(request)).toBe("203.0.113.2");
  });
});
