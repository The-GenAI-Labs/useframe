"use client";

import { memo, useCallback, type ReactNode, type CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";
import { ShapeCard } from "./ShapeCard";
import { generateSevenCornerPath } from "./generateSevenCornerPath";
import type { SevenCornerParams } from "./types";

export interface CardSevenProps extends Partial<SevenCornerParams> {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  static?: boolean;
}

export const CardSeven = memo(function CardSeven({
  className,
  style,
  children,
  static: noMotion,
  smoothing = 0.9,
  ...geo
}: CardSevenProps) {
  const reduced = useReducedMotion() ?? false;

  const pathFor = useCallback(
    (w: number, h: number) =>
      generateSevenCornerPath({ ...geo, smoothing, width: w, height: h }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      smoothing,
      geo.radius,
      geo.radiusTL,
      geo.radiusTR,
      geo.radiusBR,
      geo.radiusBL,
      geo.notchDepth,
      geo.notchWidth,
      geo.notchCorner,
    ],
  );

  const motionProps =
    noMotion || reduced
      ? undefined
      : {
          initial: { opacity: 0, y: 24 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-60px" },
          whileHover: { y: -6 },
          transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <ShapeCard pathFor={pathFor} className={className} style={style} motionProps={motionProps}>
      {children}
    </ShapeCard>
  );
});
