interface TornEdgeProps {
  edge?: "top" | "bottom";
  className?: string;
}

const TEETH = 26;
const WIDTH = 400;
const DEPTH = 16;
const TOOTH_HEIGHT = 9;

/** Builds a deterministic jagged tear line spanning the full viewBox width. */
function buildPath(edge: "top" | "bottom"): string {
  const step = WIDTH / TEETH;
  const points: string[] = [];
  for (let i = 0; i <= TEETH; i++) {
    const x = i * step;
    const peak = i % 2 === 0;
    const y = edge === "top" ? (peak ? 0 : TOOTH_HEIGHT) : peak ? DEPTH : DEPTH - TOOTH_HEIGHT;
    points.push(`${x},${y}`);
  }
  const baseline = edge === "top" ? DEPTH : 0;
  return `M0,${baseline} L${points.join(" L")} L${WIDTH},${baseline} Z`;
}

/** SVG zigzag "torn paper" strip, coloured to the receipt surface. */
export function TornEdge({ edge = "bottom", className = "" }: TornEdgeProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${WIDTH} ${DEPTH}`}
      preserveAspectRatio="none"
      className={`block h-4 w-full text-receipt ${className}`}
    >
      <path d={buildPath(edge)} fill="currentColor" />
    </svg>
  );
}
