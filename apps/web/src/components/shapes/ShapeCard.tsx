"use client";

import { memo, type ReactNode, type CSSProperties } from "react";
import { motion, type MotionProps } from "framer-motion";
import { useMeasuredSize } from "./useMeasuredSize";


export interface ShapeCardProps {
  pathFor: (width: number, height: number) => string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  motionProps?: MotionProps;
}

export const ShapeCard = memo(function ShapeCard({
  pathFor,
  className,
  style,
  children,
  motionProps,
}: ShapeCardProps) {
  const { ref, width, height } = useMeasuredSize<HTMLDivElement>();
  const path = width > 0 && height > 0 ? pathFor(width, height) : "";

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{
        ...style,
        clipPath: path ? `path('${path}')` : undefined,
        WebkitClipPath: path ? `path('${path}')` : undefined,
      }}
      {...motionProps}
    >
      {children}
    </motion.div>
  );
});
