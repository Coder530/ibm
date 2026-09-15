import { describe, expect, it, vi } from "vitest";
import { queryOverpassStores } from "./overpass";
import { StoreDiscoveryError } from "./findStores";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function htmlResponse(status = 200): Response {
  return new Response("<html><body>rate limited</body></html>", {
    status,
    headers: { "content-type": "text/html" },
  });
}

const TESCO_ELEMENT = {
  type: "node",
  id: 1,
  lat: 51.501,
  lon: -0.1415,
  tags: { shop: "supermarket", name: "Tesco Superstore" },
};

const SAINSBURYS_ELEMENT = {
  type: "node",
  id: 2,
  lat: 51.6,
  lon: -0.2,
  tags: { shop: "supermarket", name: "Sainsbury's Local" },
};

describe("queryOverpassStores", () => {
  it("resolves with mapped, sorted stores when the second of two mirrors succeeds", async () => {
    const fetchImpl = vi.fn((url: string | URL | Request) => {
      const href = String(url);
      if (href.includes("mirror1")) {
        return Promise.reject(new Error("mirror1 network error"));
      }
      return Promise.resolve(
        jsonResponse({ elements: [SAINSBURYS_ELEMENT, TESCO_ELEMENT] })
      );
    }) as unknown as typeof fetch;

    const stores = await queryOverpassStores(51.501, -0.1415, 5000, {
      fetchImpl,
      mirrors: ["https://mirror1.example", "https://mirror2.example"],
      timeoutMs: 1000,
    });

    expect(stores).toHaveLength(2);
    expect(stores[0]?.retailerId).toBe("tesco");
    expect(stores[0]?.distanceMeters).toBeLessThan(stores[1]!.distanceMeters);
    expect(stores[1]?.retailerId).toBe("sainsburys");
  });

  it("treats a 200 HTML response as a failure and still succeeds via a valid mirror", async () => {
    const fetchImpl = vi.fn((url: string | URL | Request) => {
      const href = String(url);
      if (href.includes("html-mirror")) {
        return Promise.resolve(htmlResponse());
      }
      return Promise.resolve(jsonResponse({ elements: [TESCO_ELEMENT] }));
    }) as unknown as typeof fetch;

    const stores = await queryOverpassStores(51.501, -0.1415, 5000, {
      fetchImpl,
      mirrors: ["https://html-mirror.example", "https://json-mirror.example"],
      timeoutMs: 1000,
    });

    expect(stores).toHaveLength(1);
    expect(stores[0]?.retailerId).toBe("tesco");
  });

  it("throws StoreDiscoveryError when every mirror fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error("all down")) as unknown as typeof fetch;

    await expect(
      queryOverpassStores(51.501, -0.1415, 5000, {
        fetchImpl,
        mirrors: ["https://mirror1.example", "https://mirror2.example"],
        timeoutMs: 1000,
      })
    ).rejects.toBeInstanceOf(StoreDiscoveryError);
  });

  it("queries frozen_food shops so Iceland stores (mostly tagged shop=frozen_food in OSM) are found", async () => {
    let sentBody = "";
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      sentBody = decodeURIComponent(String(init?.body ?? "").replace(/\+/g, " "));
      return Promise.resolve(
        jsonResponse({
          elements: [
            { type: "node", id: 4, lat: 51.5, lon: -0.1, tags: { shop: "frozen_food", brand: "Iceland", name: "Iceland" } },
          ],
        })
      );
    }) as unknown as typeof fetch;

    const stores = await queryOverpassStores(51.5, -0.1, 5000, {
      fetchImpl,
      mirrors: ["https://mirror1.example"],
      timeoutMs: 1000,
    });

    expect(sentBody).toContain("frozen_food");
    expect(stores).toHaveLength(1);
    expect(stores[0]?.retailerId).toBe("iceland");
  });

  it("treats a 200 response carrying a failure remark as a failed mirror, even with a valid elements array", async () => {
    const fetchImpl = vi.fn((url: string | URL | Request) => {
      const href = String(url);
      if (href.includes("mirror1")) {
        return Promise.resolve(
          jsonResponse({ remark: "runtime error: Query run out of memory", elements: [] })
        );
      }
      return Promise.resolve(jsonResponse({ elements: [TESCO_ELEMENT] }));
    }) as unknown as typeof fetch;

    const stores = await queryOverpassStores(51.501, -0.1415, 5000, {
      fetchImpl,
      mirrors: ["https://mirror1.example", "https://mirror2.example"],
      timeoutMs: 1000,
    });

    expect(stores).toHaveLength(1);
    expect(stores[0]?.retailerId).toBe("tesco");
  });

  it("throws StoreDiscoveryError when the only mirror returns a failure remark", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ remark: "runtime error: Query run out of memory", elements: [] })
      ) as unknown as typeof fetch;

    await expect(
      queryOverpassStores(51.501, -0.1415, 5000, {
        fetchImpl,
        mirrors: ["https://mirror1.example"],
        timeoutMs: 1000,
      })
    ).rejects.toBeInstanceOf(StoreDiscoveryError);
  });

  it("drops elements that don't match a supported retailer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        elements: [
          { type: "node", id: 3, lat: 51.5, lon: -0.1, tags: { shop: "convenience", name: "Joe's Shop" } },
        ],
      })
    ) as unknown as typeof fetch;

    const stores = await queryOverpassStores(51.5, -0.1, 5000, {
      fetchImpl,
      mirrors: ["https://mirror1.example"],
      timeoutMs: 1000,
    });

    expect(stores).toHaveLength(0);
  });
});
