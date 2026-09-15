import { describe, expect, it } from "vitest";
import { parseShoppingList } from "./parseList";
import { canonicalise } from "./synonyms";
import { ADAPTERS } from "@/lib/retailers/registry";

// Regression tests for R7-3: "tins/cans of <fresh produce>" must never silently
// price the fresh product.

describe("tinned intent from tin/can containers", () => {
  it("turns '2 tins of tomatoes' into tinned tomatoes, quantity 2", () => {
    const { items } = parseShoppingList("2 tins of tomatoes");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "tinned tomatoes", quantity: 2 });
    expect(canonicalise(items[0]!.name).key).toBe("chopped-tomatoes");
  });

  it("keeps a size after the tin: '3 tins of 400g tomatoes'", () => {
    const { items } = parseShoppingList("3 tins of 400g tomatoes");
    expect(items[0]).toMatchObject({ name: "tinned tomatoes", quantity: 3, size: "400g" });
  });

  it("prices tinned, never fresh, tomatoes at the Tesco demo adapter", async () => {
    const { items } = parseShoppingList("2 tins of tomatoes");
    const offers = await ADAPTERS.tesco.findOffers(items, { mode: "cheapest" });
    const offer = offers.get(items[0]!.id);
    expect(offer?.productId).not.toBe("tesco:tomatoes");
    if (offer) expect(offer.productId).toBe("tesco:chopped-tomatoes");
  });

  it("leaves fresh produce with no tinned product unmatched rather than fresh", () => {
    const { items } = parseShoppingList("a tin of carrots");
    expect(items[0]?.name).toBe("tinned carrots");
    expect(canonicalise(items[0]!.name).key).not.toBe("carrots");
  });

  it("does not touch products that are already tinned or not produce", () => {
    expect(parseShoppingList("3 tins of beans").items[0]).toMatchObject({ name: "beans", quantity: 3 });
    expect(parseShoppingList("2 tins of tuna").items[0]).toMatchObject({ name: "tuna", quantity: 2 });
    expect(parseShoppingList("2 cans of cola").items[0]).toMatchObject({ name: "cola", quantity: 2 });
    expect(parseShoppingList("2 bags of tomatoes").items[0]?.name).toBe("tomatoes");
  });
});
