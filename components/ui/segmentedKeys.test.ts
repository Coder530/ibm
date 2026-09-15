import { describe, expect, it } from "vitest";
import { isSegmentedNavKey, nextSegmentedIndex } from "./segmentedKeys";

describe("nextSegmentedIndex", () => {
  it("moves to the next index on ArrowRight and ArrowDown", () => {
    expect(nextSegmentedIndex(0, "ArrowRight", 4)).toBe(1);
    expect(nextSegmentedIndex(2, "ArrowDown", 4)).toBe(3);
  });

  it("wraps forward past the last option", () => {
    expect(nextSegmentedIndex(3, "ArrowRight", 4)).toBe(0);
    expect(nextSegmentedIndex(3, "ArrowDown", 4)).toBe(0);
  });

  it("moves to the previous index on ArrowLeft and ArrowUp", () => {
    expect(nextSegmentedIndex(2, "ArrowLeft", 4)).toBe(1);
    expect(nextSegmentedIndex(3, "ArrowUp", 4)).toBe(2);
  });

  it("wraps backward before the first option", () => {
    expect(nextSegmentedIndex(0, "ArrowLeft", 4)).toBe(3);
    expect(nextSegmentedIndex(0, "ArrowUp", 4)).toBe(3);
  });

  it("Home jumps to the first option regardless of current index", () => {
    expect(nextSegmentedIndex(2, "Home", 4)).toBe(0);
    expect(nextSegmentedIndex(0, "Home", 4)).toBe(0);
  });

  it("End jumps to the last option regardless of current index", () => {
    expect(nextSegmentedIndex(0, "End", 4)).toBe(3);
    expect(nextSegmentedIndex(2, "End", 4)).toBe(3);
  });

  it("is a no-op with a single option", () => {
    expect(nextSegmentedIndex(0, "ArrowRight", 1)).toBe(0);
    expect(nextSegmentedIndex(0, "ArrowLeft", 1)).toBe(0);
  });

  it("returns the current index unchanged when there are no options", () => {
    expect(nextSegmentedIndex(0, "ArrowRight", 0)).toBe(0);
    expect(nextSegmentedIndex(5, "End", 0)).toBe(5);
  });
});

describe("isSegmentedNavKey", () => {
  it("recognises the six navigation keys", () => {
    for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"]) {
      expect(isSegmentedNavKey(key)).toBe(true);
    }
  });

  it("rejects everything else", () => {
    for (const key of ["Enter", " ", "Tab", "a", "Escape"]) {
      expect(isSegmentedNavKey(key)).toBe(false);
    }
  });
});
