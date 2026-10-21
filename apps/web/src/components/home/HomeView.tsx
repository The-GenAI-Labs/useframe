"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { BackgroundClouds } from "./BackgroundClouds";
import { Navbar } from "./Navbar";
import { Hero } from "./Hero";
import { WorkspacePreview } from "./WorkspacePreview";
import { QuickActions } from "./QuickActions";
import { CtaSection } from "./sections/CtaSection";
import { HeroCarousel } from "./sections/HeroCarousel";
import { WatchDemoSection } from "./sections/WatchDemoSection";
import { ShowcaseCarousel } from "./sections/ShowcaseCarousel";
import { FaqSection } from "./sections/FaqSection";
import { Footer } from "./sections/Footer";
import { landingFont as serif } from "./fonts";

const EASE = [0.22, 1, 0.36, 1] as const;

function ScrollDepth({
  children,
  depth,
  reducedMotion,
  isMobile,
}: {
  children: React.ReactNode;
  depth: number;
  reducedMotion: boolean;
  isMobile: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const effectiveDepth = reducedMotion
    ? 0
    : isMobile
      ? Math.min(depth, 16)
      : depth;
  const rawY = useTransform(
    scrollYProgress,
    [0, 1],
    [effectiveDepth, -effectiveDepth],
  );
  const y = useSpring(rawY, { stiffness: 45, damping: 18, mass: 0.7 });
  return (
    <div ref={ref}>
      <motion.div style={{ y }}>{children}</motion.div>
    </div>
  );
}

function RevealSection({
  children,
  depth = 30,
  delay = 0,
  yOffset = 70,
  reducedMotion,
  isMobile,
}: {
  children: React.ReactNode;
  depth?: number;
  delay?: number;
  yOffset?: number;
  reducedMotion: boolean;
  isMobile: boolean;
}) {
  return (
    <ScrollDepth
      depth={depth}
      reducedMotion={reducedMotion}
      isMobile={isMobile}
    >
      <motion.div
        initial={{
          opacity: reducedMotion ? 1 : 0,
          y: reducedMotion ? 0 : isMobile ? Math.min(yOffset, 28) : yOffset,
          scale: reducedMotion ? 1 : 0.98,
        }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, amount: 0.06 }}
        transition={{
          opacity: { duration: reducedMotion ? 0 : 0.7, delay, ease: EASE },
          y: { duration: reducedMotion ? 0 : 0.85, delay, ease: EASE },
          scale: { duration: reducedMotion ? 0 : 0.85, delay, ease: EASE },
        }}
      >
        {children}
      </motion.div>
    </ScrollDepth>
  );
}

export const HomeView = memo(function HomeView() {
  const isMobile = useIsMobile();
  const prefersReducedMotion = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(prefersReducedMotion ?? false);
  }, [prefersReducedMotion]);

  return (
    <div
      className={`${serif.className} relative w-full overflow-x-clip`}
      style={{ fontOpticalSizing: "auto" }}
    >
      <Navbar serifClassName={serif.className} />

      <div className="relative h-screen w-full">
        <BackgroundClouds />
        {/* Spacing between heading -> robot/box -> quick actions lives only
            here (gap-*), so the three never drift apart. The robot is
            absolutely positioned against the box, so it adds no flow height. */}
        <main className="relative z-10 flex w-full flex-col items-center gap-10 px-4 pt-28 sm:pt-32">
          <Hero serifClassName={serif.className} />
          <WorkspacePreview />
          <QuickActions />
        </main>
      </div>

      <div className="relative z-10 -mt-px flex flex-col gap-16 bg-white sm:gap-24">
        <RevealSection
          depth={18}
          delay={0}
          yOffset={50}
          reducedMotion={reducedMotion}
          isMobile={isMobile}
        >
          <CtaSection />
        </RevealSection>

        <HeroCarousel />

        <WatchDemoSection />

        <RevealSection
          depth={48}
          delay={0.04}
          yOffset={80}
          reducedMotion={reducedMotion}
          isMobile={isMobile}
        >
          <ShowcaseCarousel />
        </RevealSection>

        <RevealSection
          depth={30}
          delay={0.04}
          yOffset={70}
          reducedMotion={reducedMotion}
          isMobile={isMobile}
        >
          <FaqSection />
        </RevealSection>

        <Footer />
      </div>
    </div>
  );
});
