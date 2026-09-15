import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/validation/schemas";
import { parseShoppingList } from "./parseList";

describe("parseShoppingList", () => {
  it('parses "2x milk 4 pints"', () => {
    const { items } = parseShoppingList("2x milk 4 pints");
    expect(items).toEqual([
      { id: "item-0", name: "milk", quantity: 2, size: "4 pints", category: "dairy" },
    ]);
  });

  it('parses "500g beef mince"', () => {
    const { items } = parseShoppingList("500g beef mince");
    expect(items[0]).toMatchObject({ name: "beef mince", quantity: 1, size: "500g", category: "meat" });
  });

  it('parses "a dozen eggs" as one 12 pack', () => {
    const { items } = parseShoppingList("a dozen eggs");
    expect(items[0]).toMatchObject({ name: "eggs", quantity: 1, size: "12 pack" });
  });

  it('parses "3 bananas" as a count of bananas (one 3 pack), not three packs', () => {
    const { items } = parseShoppingList("3 bananas");
    expect(items[0]).toMatchObject({ name: "bananas", quantity: 1, size: "3 pack" });
  });

  it('parses "bananas" with quantity 1', () => {
    const { items } = parseShoppingList("bananas");
    expect(items[0]).toMatchObject({ name: "bananas", quantity: 1, category: "fruit" });
  });

  it("strips bullets and checkboxes", () => {
    const { items } = parseShoppingList("- milk\n* bread\n• eggs\n[ ] butter\n[x] cheddar");
    expect(items.map((i) => i.name)).toEqual(["milk", "bread", "eggs", "butter", "cheddar"]);
  });

  it("ignores blank lines", () => {
    const { items, warnings } = parseShoppingList("\n\nmilk\n   \n\nbread\n");
    expect(items.map((i) => i.name)).toEqual(["milk", "bread"]);
    expect(items.map((i) => i.id)).toEqual(["item-0", "item-1"]);
    expect(warnings).toEqual([]);
  });

  it("splits on commas, semicolons and ' and ' only between items", () => {
    const { items } = parseShoppingList("milk, bread; bread and butter\nfish and chips");
    expect(items.map((i) => i.name)).toEqual(["milk", "bread", "butter", "fish and chips"]);
  });

  it("merges duplicates by summing quantity with a warning", () => {
    const { items, warnings } = parseShoppingList("milk\n2 milk\nMilk 4 pints");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: "milk", quantity: 3 });
    expect(items[1]).toMatchObject({ name: "Milk", size: "4 pints", quantity: 1 });
    expect(warnings).toContain("Merged duplicate: milk");
  });

  it(`truncates lists over ${LIMITS.maxItems} items with a warning`, () => {
    const text = Array.from({ length: 65 }, (_, i) => `thing number ${i}`).join("\n");
    const { items, warnings } = parseShoppingList(text);
    expect(items).toHaveLength(LIMITS.maxItems);
    expect(items.at(-1)?.id).toBe(`item-${LIMITS.maxItems - 1}`);
    expect(warnings.some((w) => w.includes(`first ${LIMITS.maxItems}`))).toBe(true);
  });

  it("clamps quantity 500 to 99 with a warning", () => {
    const { items, warnings } = parseShoppingList("500 tins of beans");
    expect(items[0]?.quantity).toBe(99);
    expect(warnings.some((w) => w.includes("99"))).toBe(true);
  });

  it("clamps quantity 0 up to 1", () => {
    const { items, warnings } = parseShoppingList("0 x bananas");
    expect(items[0]?.quantity).toBe(1);
    expect(warnings).toHaveLength(1);
  });

  it("trims names to the max length", () => {
    const { items, warnings } = parseShoppingList("b".repeat(200));
    expect(items[0]?.name).toHaveLength(LIMITS.maxNameLength);
    expect(warnings).toHaveLength(1);
  });

  it("treats a count of eggs as one pack, not many packs", () => {
    const { items } = parseShoppingList("12 eggs");
    expect(items[0]).toMatchObject({ name: "eggs", quantity: 1, size: "12 pack" });
  });

  it("handles container words and trailing multipliers", () => {
    const { items } = parseShoppingList("2 bags of potatoes\nbaked beans x4\n1.5kg chicken breast");
    expect(items[0]).toMatchObject({ name: "potatoes", quantity: 2 });
    expect(items[1]).toMatchObject({ name: "baked beans", quantity: 4 });
    expect(items[2]).toMatchObject({ name: "chicken breast", quantity: 1, size: "1.5kg" });
  });

  it("uses a custom id prefix and is deterministic", () => {
    const a = parseShoppingList("milk\nbread", { idPrefix: "list" });
    const b = parseShoppingList("milk\nbread", { idPrefix: "list" });
    expect(a).toEqual(b);
    expect(a.items.map((i) => i.id)).toEqual(["list-0", "list-1"]);
  });

  it("returns no items and a warning for a size with no name", () => {
    const { items, warnings } = parseShoppingList("500g");
    expect(items).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it("returns empty for empty input", () => {
    expect(parseShoppingList("")).toEqual({ items: [], warnings: [] });
  });

  it.each([
    ["6 bananas", "bananas", "6 pack"],
    ["3 eggs", "eggs", "3 pack"],
    ["2 eggs", "eggs", "2 pack"],
    ["2 avocados", "avocados", "2 pack"],
    ["4 onions", "onions", "4 pack"],
    ["2 toilet roll", "toilet roll", "2 pack"],
  ])("F-1: %s is a count of a countable product (one %s item sized %s)", (text, name, size) => {
    const { items } = parseShoppingList(text);
    expect(items[0]).toMatchObject({ name, quantity: 1, size });
  });

  it("F-1: non-countable items and single counts keep their quantity", () => {
    expect(parseShoppingList("2 bags of potatoes").items[0]).toMatchObject({ name: "potatoes", quantity: 2 });
    expect(parseShoppingList("2 bags of potatoes").items[0]?.size).toBeUndefined();
    expect(parseShoppingList("1 banana").items[0]).toMatchObject({ quantity: 1 });
    expect(parseShoppingList("1 banana").items[0]?.size).toBeUndefined();
    expect(parseShoppingList("3 milk").items[0]).toMatchObject({ name: "milk", quantity: 3 });
  });

  it.each([
    ["2x 12 eggs", "eggs", "12 pack", 2],
    ["2 x 12 eggs", "eggs", "12 pack", 2],
    ["6 eggs x2", "eggs", "6 pack", 2],
    ["2 x 500g mince", "mince", "2 x 500g", 1],
    ["500g mince x2", "mince", "500g", 2],
  ])("F-9: compound quantity %s → %s, size %s, quantity %d", (text, name, size, quantity) => {
    const { items } = parseShoppingList(text);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name, size, quantity });
  });

  it.each([
    ["2 boxes of eggs", "eggs", 2],
    ["2 packs of toilet roll", "toilet roll", 2],
    ["2 boxes of tea bags", "tea bags", 2],
    ["2 bunches of bananas", "bananas", 2],
    ["2 nets of lemons", "lemons", 2],
    ["3 tins of beans", "beans", 3],
    ["2 bags of crisps", "crisps", 2],
  ])("R3-1: container phrase %s keeps N as the number of packs (%s × %d, no count size)", (text, name, quantity) => {
    const { items } = parseShoppingList(text);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name, quantity });
    expect(items[0]?.size).toBeUndefined();
  });

  it("R3-1: explicit pack sizes and bare counts still become one pack", () => {
    expect(parseShoppingList("6 pack of eggs").items[0]).toMatchObject({ name: "eggs", quantity: 1, size: "6 pack" });
    expect(parseShoppingList("6 eggs").items[0]).toMatchObject({ name: "eggs", quantity: 1, size: "6 pack" });
  });

  it.each([
    ["beef mince 20%", "beef mince 20%"],
    ["20 % fat beef mince", "20% fat beef mince"],
    ["20 percent fat mince", "20% fat mince"],
    ["5 % fat mince", "5% fat mince"],
    ["skimmed milk 1%", "skimmed milk 1%"],
    ["greek yoghurt 0%", "greek yoghurt 0%"],
  ])("R3-2/R3-3: percent form %s → quantity 1, name %s", (text, name) => {
    const { items } = parseShoppingList(text);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name, quantity: 1 });
    expect(items[0]?.size).toBeUndefined();
  });

  it("R3-7: countable duplicates merge by canonical key, summing counts before the pack conversion", () => {
    const summed = parseShoppingList("2 eggs\n3 eggs");
    expect(summed.items).toHaveLength(1);
    expect(summed.items[0]).toMatchObject({ name: "eggs", quantity: 1, size: "5 pack" });
    expect(summed.warnings).toContain("Merged duplicate: eggs");

    const same = parseShoppingList("6 eggs\n6 eggs");
    expect(same.items).toHaveLength(1);
    expect(same.items[0]).toMatchObject({ name: "eggs", quantity: 1, size: "12 pack" });
    expect(same.warnings).toContain("Merged duplicate: eggs");

    // A bare line with no number counts as one.
    expect(parseShoppingList("eggs\n2 eggs").items).toEqual([
      { id: "item-0", name: "eggs", quantity: 1, size: "3 pack", category: "dairy" },
    ]);
  });

  it("R3-7: container-phrase duplicates merge by summing pack quantity", () => {
    const { items, warnings } = parseShoppingList("2 boxes of eggs\n1 box of eggs");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "eggs", quantity: 3 });
    expect(items[0]?.size).toBeUndefined();
    expect(warnings).toContain("Merged duplicate: eggs");
  });
});

describe("F7 parse regressions", () => {
  it.each([
    ["2 packs of 12 eggs", "eggs", "12 pack", 2],
    ["2 boxes of 12 eggs", "eggs", "12 pack", 2],
    ["a bag of 6 apples", "apples", "6 pack", 1],
    ["3 packs of 6 eggs", "eggs", "6 pack", 3],
    ["2 packs of 4 avocados", "avocados", "4 pack", 2],
    ["2 bags of 1kg potatoes", "potatoes", "1kg", 2],
  ])("M3: a count after a container phrase is the pack size: %s → %s, size %s, quantity %d", (text, name, size, quantity) => {
    const { items } = parseShoppingList(text);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name, size, quantity });
  });

  it("M3: container lines without an inner count are unchanged", () => {
    const { items } = parseShoppingList("2 boxes of eggs");
    expect(items[0]).toMatchObject({ name: "eggs", quantity: 2 });
    expect(items[0]?.size).toBeUndefined();
  });

  it("M4: countable lines with different material qualifiers never merge", () => {
    for (const text of ["2 organic bananas\n3 bananas", "3 bananas\n2 organic bananas"]) {
      const { items, warnings } = parseShoppingList(text);
      expect(items, text).toHaveLength(2);
      expect(items.find((i) => i.name === "organic bananas")).toMatchObject({ quantity: 1, size: "2 pack" });
      expect(items.find((i) => i.name === "bananas")).toMatchObject({ quantity: 1, size: "3 pack" });
      expect(warnings.some((w) => w.startsWith("Merged duplicate"))).toBe(false);
    }
    const same = parseShoppingList("2 organic bananas\n3 organic bananas");
    expect(same.items).toHaveLength(1);
    expect(same.items[0]).toMatchObject({ name: "organic bananas", size: "5 pack" });
    expect(same.warnings).toContain("Merged duplicate: organic bananas");
  });

  it.each(["eggs x2", "2x eggs", "2 x eggs"])("L5: x-form %s is 2 of the default pack, not a count of 2", (text) => {
    const { items } = parseShoppingList(text);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "eggs", quantity: 2 });
    expect(items[0]?.size).toBeUndefined();
  });

  it("L5: a bare '2 eggs' stays a count", () => {
    expect(parseShoppingList("2 eggs").items[0]).toMatchObject({ name: "eggs", quantity: 1, size: "2 pack" });
  });

  it("L5: a count line and a pack line for the same product don't merge but are flagged", () => {
    const { items, warnings } = parseShoppingList("eggs x2\n6 eggs");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: "eggs", quantity: 2 });
    expect(items[1]).toMatchObject({ name: "eggs", quantity: 1, size: "6 pack" });
    expect(warnings).toContain("Check quantity: eggs appears more than once");
    expect(warnings.some((w) => w.startsWith("Merged duplicate"))).toBe(false);
  });
});
