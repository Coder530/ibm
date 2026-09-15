"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { ShoppingItem } from "@/types/shopping";
import { parseShoppingList } from "@/lib/products/parseList";
import { Button } from "@/components/ui/Button";
import { ParsedItemRow } from "./ParsedItemRow";

interface ListStepProps {
  listText: string;
  items: ShoppingItem[];
  warnings: string[];
  onChange: (listText: string, items: ShoppingItem[], warnings: string[]) => void;
  onCompare: () => void;
  comparing?: boolean;
}

const EXAMPLE_LIST = "2 pints milk\n6 eggs\n500g beef mince\na loaf of bread\n2l orange juice";
const DEBOUNCE_MS = 150;
const TYPE_INTERVAL_MS = 16;

let idCounter = 0;
function nextManualId(): string {
  idCounter += 1;
  return `manual-${Date.now()}-${idCounter}`;
}

export function ListStep({ listText, items, warnings, onChange, onCompare, comparing }: ListStepProps) {
  // Initialised once from the incoming list text. ListStep only ever exists
  // while state.step === "list"; ReceiptApp unmounts it for every other
  // step, so a fresh mount is how re-sync happens — no effect needed.
  const [draft, setDraft] = useState(listText);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (typeRef.current) clearInterval(typeRef.current);
    },
    []
  );

  const parseAndEmit = (text: string): void => {
    const { items: parsed, warnings: parseWarnings } = parseShoppingList(text);
    onChange(text, parsed, parseWarnings);
  };

  const handleDraftChange = (text: string): void => {
    setDraft(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => parseAndEmit(text), DEBOUNCE_MS);
  };

  const handleExample = (): void => {
    if (typeRef.current) clearInterval(typeRef.current);
    if (reducedMotion) {
      setDraft(EXAMPLE_LIST);
      parseAndEmit(EXAMPLE_LIST);
      return;
    }
    // Elapsed-time based rather than tick-counted: a throttled timer (the
    // observed ~15s stall) still lands on the fully-typed state within
    // TYPE_INTERVAL_MS * EXAMPLE_LIST.length of wall-clock time, because each
    // tick jumps the visible slice ahead to match how much time has actually
    // passed rather than advancing by one character per tick.
    const start = Date.now();
    typeRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const visible = Math.min(EXAMPLE_LIST.length, Math.floor(elapsed / TYPE_INTERVAL_MS));
      setDraft(EXAMPLE_LIST.slice(0, visible));
      if (visible >= EXAMPLE_LIST.length) {
        if (typeRef.current) clearInterval(typeRef.current);
        parseAndEmit(EXAMPLE_LIST);
      }
    }, TYPE_INTERVAL_MS);
  };

  const updateItem = (index: number, next: ShoppingItem): void => {
    const nextItems = items.map((item, i) => (i === index ? next : item));
    onChange(listText, nextItems, warnings);
  };

  const removeItem = (index: number): void => {
    onChange(
      listText,
      items.filter((_, i) => i !== index),
      warnings
    );
  };

  const addItem = (): void => {
    onChange(listText, [...items, { id: nextManualId(), name: "", quantity: 1 }], warnings);
  };

  const canCompare = items.length > 0 && items.every((item) => item.name.trim().length > 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="shopping-list-input" className="receipt-label">
          Your shopping list
        </label>
        <textarea
          id="shopping-list-input"
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          placeholder={"e.g.\n2 pints milk\n500g beef mince\na dozen eggs"}
          rows={4}
          className="min-h-28 w-full resize-y border border-rule bg-receipt p-3 font-sans text-base text-ink placeholder:text-ink-faint focus-visible:border-tomato"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" className="px-2" onClick={handleExample}>
            Try an example
          </Button>
          {warnings.length > 0 ? (
            <p className="text-xs text-amber" role="status">
              {warnings[0]}
              {warnings.length > 1 ? ` (+${warnings.length - 1} more)` : ""}
            </p>
          ) : null}
        </div>
      </div>

      {items.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <p className="receipt-label">
              {items.length} {items.length === 1 ? "item" : "items"}
            </p>
            <Button type="button" variant="ghost" className="px-2 text-xs" onClick={addItem}>
              + Add item
            </Button>
          </div>
          <ul>
            {items.map((item, index) => (
              <ParsedItemRow
                key={item.id}
                item={item}
                onChange={(next) => updateItem(index, next)}
                onRemove={() => removeItem(index)}
              />
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2 border border-dashed border-rule p-4">
          <p className="text-sm text-ink-soft">Nothing on your list yet.</p>
          <Button type="button" variant="ghost" className="px-2" onClick={addItem}>
            + Add an item manually
          </Button>
        </div>
      )}

      <div className="flex flex-col items-start gap-1.5">
        <Button
          onClick={onCompare}
          disabled={!canCompare || comparing}
          className="active:bg-tomato"
        >
          {comparing ? "Comparing…" : "Compare prices"}
        </Button>
        {!canCompare ? (
          <p className="text-xs text-ink-soft">
            {items.length === 0
              ? "Add at least one item to compare prices."
              : "Every item needs a name before you can compare."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
