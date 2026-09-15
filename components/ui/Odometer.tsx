"use client";

import { motion, useReducedMotion } from "motion/react";
import { formatMinor } from "@/lib/units/money";

interface OdometerProps {
  minor: number;
  className?: string;
}

function Digit({ value }: { value: number }) {
  return (
    <span className="relative inline-block h-[1em] w-[0.64em] overflow-hidden align-baseline">
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        animate={{ y: `${-value}em` }}
        transition={{ type: "spring", stiffness: 210, damping: 24 }}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="block h-[1em] text-center leading-[1em]">
            {i}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/**
 * Per-digit rolling total, JetBrains Mono tabular. Screen readers get only
 * the final formatted value — the rolling columns are decorative and hidden.
 */
export function Odometer({ minor, className = "" }: OdometerProps) {
  const reducedMotion = useReducedMotion();
  const text = formatMinor(minor);

  if (reducedMotion) {
    return <span className={`font-mono tabular-nums ${className}`}>{text}</span>;
  }

  return (
    <span className={`inline-flex items-baseline font-mono tabular-nums ${className}`}>
      <span aria-hidden="true" className="inline-flex items-baseline">
        {[...text].map((ch, i) =>
          /\d/.test(ch) ? <Digit key={i} value={Number(ch)} /> : <span key={i}>{ch}</span>
        )}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
