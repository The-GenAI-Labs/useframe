"use client";

import { memo, useRef } from "react";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";

type ParallaxProps = {
  children: React.ReactNode;
  offset?: number;
  className?: string;
};

export const Parallax = memo(function Parallax({ children, offset = 80, className }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });

  const rawY = useTransform(scrollYProgress, [0, 1], [offset, -offset]);
  const y = useSpring(rawY, { stiffness: 60, damping: 20, mass: 0.6 });

  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  );
});
