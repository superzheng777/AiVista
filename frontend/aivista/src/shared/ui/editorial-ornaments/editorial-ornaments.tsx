import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

type DotMatrixProps = {
  columns: number;
  rows: number;
  dotSize?: number | string;
  gap?: number | string;
  color?: string;
  opacity?: number;
  className?: string;
};

/** A non-interactive dot grid for the editorial layout language used across workspace pages. */
export function DotMatrix({
  columns,
  rows,
  dotSize = 3,
  gap = 7,
  color = "#a99c8d",
  opacity = 0.4,
  className,
}: DotMatrixProps) {
  const size = typeof dotSize === "number" ? `${dotSize}px` : dotSize;
  const spacing = typeof gap === "number" ? `${gap}px` : gap;
  const style = {
    gridTemplateColumns: `repeat(${columns}, ${size})`,
    gap: spacing,
    opacity,
  } satisfies CSSProperties;

  return <span aria-hidden="true" className={cn("pointer-events-none grid w-fit", className)} style={style}>
    {Array.from({ length: columns * rows }, (_, index) => <span key={index} className="block rounded-full" style={{ width: size, height: size, backgroundColor: color }} />)}
  </span>;
}

type AccentSquareProps = {
  size?: number | string;
  width?: number | string;
  height?: number | string;
  color?: string;
  className?: string;
};

/** A purely decorative accent block. Position it through the parent layout or `className`. */
export function AccentSquare({ size, width, height, color = "#c95f3f", className }: AccentSquareProps) {
  const normalized = (value: number | string | undefined) => typeof value === "number" ? `${value}px` : value;
  const style = { width: normalized(width ?? size), height: normalized(height ?? size), backgroundColor: color } satisfies CSSProperties;
  return <span aria-hidden="true" className={cn("pointer-events-none block", className)} style={style} />;
}
