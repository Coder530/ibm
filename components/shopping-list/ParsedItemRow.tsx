"use client";

import type { ShoppingItem } from "@/types/shopping";
import { Field } from "@/components/ui/Field";

interface ParsedItemRowProps {
  item: ShoppingItem;
  onChange: (item: ShoppingItem) => void;
  onRemove: () => void;
}

const MIN_QTY = 1;
const MAX_QTY = 99;

/** One editable receipt line: qty stepper, name, size, remove. */
export function ParsedItemRow({ item, onChange, onRemove }: ParsedItemRowProps) {
  const decrement = (): void => onChange({ ...item, quantity: Math.max(MIN_QTY, item.quantity - 1) });
  const increment = (): void => onChange({ ...item, quantity: Math.min(MAX_QTY, item.quantity + 1) });

  return (
    <li className="flex flex-wrap items-end gap-3 border-b border-dotted border-rule py-3 last:border-b-0">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={decrement}
          aria-label={`Decrease quantity of ${item.name || "item"}`}
          disabled={item.quantity <= MIN_QTY}
          className="flex h-11 w-11 items-center justify-center rounded-sm border border-ink text-lg leading-none text-ink transition-colors duration-150 hover:bg-receipt disabled:opacity-40 disabled:hover:bg-transparent"
        >
          −
        </button>
        <span className="w-7 text-center font-mono text-base tabular-nums" aria-live="polite">
          {item.quantity}
        </span>
        <button
          type="button"
          onClick={increment}
          aria-label={`Increase quantity of ${item.name || "item"}`}
          disabled={item.quantity >= MAX_QTY}
          className="flex h-11 w-11 items-center justify-center rounded-sm border border-ink text-lg leading-none text-ink transition-colors duration-150 hover:bg-receipt disabled:opacity-40 disabled:hover:bg-transparent"
        >
          +
        </button>
      </div>

      <div className="min-w-36 flex-1">
        <Field
          label="Item"
          value={item.name}
          onChange={(e) => onChange({ ...item, name: e.target.value })}
        />
      </div>
      <div className="w-28">
        <Field
          label="Size"
          placeholder="e.g. 2l"
          value={item.size ?? ""}
          onChange={(e) => onChange({ ...item, size: e.target.value || undefined })}
        />
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.name || "item"}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center text-ink-soft transition-colors duration-150 hover:bg-receipt hover:text-tomato"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </li>
  );
}
