import type { CSSProperties, ReactNode } from "react";

interface StampProps {
  children: ReactNode;
  rotate?: number;
  className?: string;
}

/** Rubber-stamp badge — thumps in with rotation via CSS keyframes (reduced-motion aware globally). */
export function Stamp({ children, rotate = -6, className = "" }: StampProps) {
  const style = {
    "--stamp-rotate": `${rotate}deg`,
    transform: `rotate(${rotate}deg)`,
  } as CSSProperties;

  return (
    <div
      style={style}
      className={`inline-flex items-center gap-1.5 rounded-sm border-2 border-tomato px-3 py-1.5 font-mono text-sm font-bold tracking-wider text-tomato-ink uppercase tabular-nums animate-thump ${className}`}
    >
      {children}
    </div>
  );
}
