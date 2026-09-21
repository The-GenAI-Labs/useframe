"use client";

import { memo, useRef } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { BackgroundClouds } from "./BackgroundClouds";
import { Navbar } from "./Navbar";
import { Hero } from "./Hero";
import { WorkspacePreview } from "./WorkspacePreview";
import { QuickActions } from "./QuickActions";
import { CtaSection } from "./sections/CtaSection";
import { HeroCarousel } from "./sections/HeroCarousel";
import { TemplatesSection } from "./sections/TemplatesSection";
import { PricingSection } from "./sections/PricingSection";
import { ShowcaseCarousel } from "./sections/ShowcaseCarousel";
import { Footer } from "./sections/Footer";
import { serif } from "./fonts";

const EASE = [0.22, 1, 0.36, 1] as const;

function ScrollDepth({
  children,
  depth,
}: {
  children: React.ReactNode;
  depth: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const rawY = useTransform(scrollYProgress, [0, 1], [depth, -depth]);
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
}: {
  children: React.ReactNode;
  depth?: number;
  delay?: number;
  yOffset?: number;
}) {
  return (
    <ScrollDepth depth={depth}>
      <motion.div
        initial={{ opacity: 0, y: yOffset, scale: 0.98 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, amount: 0.06 }}
        transition={{
          opacity: { duration: 0.7,  delay, ease: EASE },
          y:       { duration: 0.85, delay, ease: EASE },
          scale:   { duration: 0.85, delay, ease: EASE },
        }}
      >
        {children}
      </motion.div>
    </ScrollDepth>
  );
}

export const HomeView = memo(function HomeView() {
  return (
    <div className="relative w-full overflow-x-clip">

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

      <div className="relative z-10 -mt-px bg-white">

        <RevealSection depth={18} delay={0}    yOffset={50}>
          <CtaSection />
        </RevealSection>

        <RevealSection depth={38} delay={0.04} yOffset={70}>
          <HeroCarousel />
        </RevealSection>

        <RevealSection depth={28} delay={0.04} yOffset={65}>
          <TemplatesSection />
        </RevealSection>

        <RevealSection depth={42} delay={0.04} yOffset={70}>
          <PricingSection />
        </RevealSection>

        <div
          aria-hidden
          className="pointer-events-none relative z-0 h-20 w-full sm:h-28"
          style={{
            background:
              "linear-gradient(to bottom, transparent 0%, rgba(37,99,235,0.06) 50%, transparent 100%)",
          }}
        />

        <RevealSection depth={48} delay={0.04} yOffset={80}>
          <ShowcaseCarousel />
        </RevealSection>

        <Footer />
      </div>
    </div>
  );
});
