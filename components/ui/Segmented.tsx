"use client";

import { useRef, type KeyboardEvent } from "react";
import { isSegmentedNavKey, nextSegmentedIndex } from "@/components/ui/segmentedKeys";

interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string | number> {
  legend: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Generic segmented radio group (priority, transport, max stores, radius). */
export function Segmented<T extends string | number>({
  legend,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((opt) => opt.value === value);
  // Roving tabindex: the selected option is the only one in the tab order;
  // if nothing matches the current value, fall back to the first option.
  const rovingIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!isSegmentedNavKey(event.key)) return;
    event.preventDefault();
    const nextIndex = nextSegmentedIndex(rovingIndex, event.key, options.length);
    const nextOption = options[nextIndex];
    if (!nextOption) return;
    onChange(nextOption.value);
    buttonRefs.current[nextIndex]?.focus();
  };

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="receipt-label">{legend}</legend>
      <div
        role="radiogroup"
        aria-label={legend}
        onKeyDown={handleKeyDown}
        className="flex flex-wrap gap-1 rounded-sm border border-rule bg-receipt p-1"
      >
        {options.map((opt, index) => {
          const selected = opt.value === value;
          return (
            <button
              key={String(opt.value)}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={index === rovingIndex ? 0 : -1}
              onClick={() => onChange(opt.value)}
              className={`min-h-11 flex-1 rounded-sm px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
                selected ? "bg-ink text-receipt" : "text-ink-soft hover:bg-paper"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
