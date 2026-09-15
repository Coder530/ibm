/** Keys the Segmented radiogroup responds to for roving-tabindex navigation. */
export type SegmentedNavKey = "ArrowRight" | "ArrowDown" | "ArrowLeft" | "ArrowUp" | "Home" | "End";

const NAV_KEYS: readonly SegmentedNavKey[] = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];

export function isSegmentedNavKey(key: string): key is SegmentedNavKey {
  return (NAV_KEYS as readonly string[]).includes(key);
}

/**
 * Pure next-index logic for a Segmented radiogroup: ArrowRight/ArrowDown
 * move forward (wrapping), ArrowLeft/ArrowUp move backward (wrapping), Home
 * jumps to the first option, End to the last. `length <= 0` is a no-op
 * (returns `current` unchanged) since there's nothing to move to.
 */
export function nextSegmentedIndex(current: number, key: SegmentedNavKey, length: number): number {
  if (length <= 0) return current;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1 + length) % length;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + length) % length;
    case "Home":
      return 0;
    case "End":
      return length - 1;
    default:
      return current;
  }
}
