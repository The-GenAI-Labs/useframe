"use client";

import { memo, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import type { MotionValue } from "framer-motion";
import {
  ArrowUpRight,
  Check,
  Globe,
  Play,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { landingFont } from "../fonts";
import styles from "./WatchDemoSection.module.css";

const VIDEO_URL = "https://www.youtube.com/watch?v=DhJBlhw8Ye8";
const EMBED_URL =
  "https://www.youtube.com/embed/DhJBlhw8Ye8?autoplay=1&controls=1&playsinline=1&rel=0";
const EASE = [0.22, 1, 0.36, 1] as const;
const CARDS = [
  {
    id: "models",
    title: "Build with Claude",
    icon: Sparkles,
    label: "Powerful models. Thoughtful websites.",
    description:
      "Build with Claude Opus and Sonnet, connect tools through MCP, and refine your website through natural conversation.",
    lines: [
      "Claude Opus & Sonnet",
      "MCP tool connections",
      "Refine through chat",
    ],
    depth: 18,
    tilt: -7,
  },
  {
    id: "deployment",
    title: "Launch on Cloudflare",
    icon: ShieldCheck,
    label: "Fast delivery. Safer publishing.",
    description:
      "Publish to Cloudflare's edge with isolated builds and HTTPS delivery. Preview your changes before you go live.",
    lines: [
      "Cloudflare edge hosting",
      "Isolated site builds",
      "HTTPS delivery",
    ],
    depth: -14,
    tilt: 8,
  },
  {
    id: "domains",
    title: "Your site. Your address.",
    icon: Globe,
    label: "A home for your brand.",
    description:
      "Launch on a UseFrame subdomain, or connect your own domain where available.",
    lines: ["UseFrame subdomain included", "Verified custom domains"],
    depth: 12,
    tilt: -5,
  },
] as const;

function Grain({ id }: { id: string }) {
  return (
    <svg
      aria-hidden="true"
      className={styles.grain}
      xmlns="http://www.w3.org/2000/svg"
    >
      <filter
        id={id}
        x="-5%"
        y="-5%"
        width="110%"
        height="110%"
        colorInterpolationFilters="sRGB"
      >
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.72 0.68"
          numOctaves="4"
          seed="12"
          stitchTiles="stitch"
          result="noise"
        />
        <feColorMatrix
          type="saturate"
          values="0"
          in="noise"
          result="grayNoise"
        />
        <feComponentTransfer in="grayNoise">
          <feFuncR type="linear" slope="4" intercept="-1.5" />
          <feFuncG type="linear" slope="4" intercept="-1.5" />
          <feFuncB type="linear" slope="4" intercept="-1.5" />
        </feComponentTransfer>
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
}

function FloatingCard({
  id,
  label,
  className,
  depth,
  index,
  progress,
  active,
  reduced,
  onHover,
  onFocus,
  children,
  video = false,
  tilt = 0,
}: {
  id: string;
  label: string;
  className: string;
  depth: number;
  index: number;
  progress: MotionValue<number>;
  active: string | null;
  reduced: boolean;
  onHover: (id: string | null) => void;
  onFocus: (id: string | null) => void;
  children: ReactNode;
  video?: boolean;
  tilt?: number;
}) {
  const grainId = useId();
  const selected = active === id;
  const inactive = active !== null && !selected;
  const rawY = useTransform(
    progress,
    [0, 1],
    [depth - (selected ? 7 : 0), -depth - (selected ? 7 : 0)],
  );
  const y = useSpring(rawY, { stiffness: 60, damping: 20, mass: 0.6 });
  const Component = video ? motion.article : motion.button;

  return (
    <Component
      type={video ? undefined : "button"}
      aria-label={label}
      aria-pressed={video ? undefined : selected}
      data-demo-card={id}
      data-active={selected}
      data-inactive={inactive}
      className={`${styles.card} ${className}`}
      style={{
        zIndex: selected ? 20 : video ? 5 : index + 1,
        y: reduced ? 0 : y,
      }}
      initial={{ opacity: reduced ? 1 : 0, scale: reduced ? 1 : 0.96 }}
      whileInView={{
        opacity: inactive ? 0.65 : 1,
        scale: reduced ? 1 : selected ? 1.03 : 1,
        rotate: reduced ? 0 : tilt,
      }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: reduced ? 0 : 0.45, ease: EASE }}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") onHover(id);
      }}
      onPointerLeave={() => onHover(null)}
      onPointerDown={(event) => {
        if (event.pointerType === "touch") onFocus(id);
      }}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) onFocus(id);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onFocus(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onFocus(null);
          onHover(null);
        }
      }}
    >
      <Grain id={`demo-grain-${grainId}`} />
      <motion.div
        className={styles.cardContent}
        initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{
          duration: reduced ? 0 : 0.6,
          delay: reduced ? 0 : index * 0.08,
          ease: EASE,
        }}
      >
        {children}
      </motion.div>
    </Component>
  );
}

export const WatchDemoSection = memo(function WatchDemoSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(prefersReducedMotion ?? false);
  }, [prefersReducedMotion]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const active = hovered ?? focused;

  return (
    <section
      id="watch-demo"
      ref={sectionRef}
      aria-labelledby="demo-heading"
      className={styles.section}
    >
      <motion.header
        className={styles.heading}
        initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: reduced ? 0 : 0.7, ease: EASE }}
      >
        <span className={styles.eyebrow}>Watch Demo</span>
        <h2 id="demo-heading" className={landingFont.className}>
          From idea to launch. See it in action.
        </h2>
        <p>
          A closer look at UseFrame. Research, create, and refine your website
          in one place.
        </p>
      </motion.header>

      <div className={styles.stage} onPointerLeave={() => setHovered(null)}>
        <div
          className={styles.focusBackdrop}
          data-visible={active !== null}
          aria-hidden="true"
        />
        <FloatingCard
          id="video"
          label="UseFrame demo video"
          className={styles.videoCard}
          depth={6}
          index={0}
          progress={scrollYProgress}
          active={active}
          reduced={reduced}
          onHover={setHovered}
          onFocus={setFocused}
          video
        >
          <div className={styles.videoHeader}>
            <span className={styles.brandMark}>
              <Sparkles size={16} aria-hidden="true" /> UseFrame
            </span>
            <span className={styles.videoBadge}>Product walkthrough</span>
          </div>
          <div className={styles.player}>
            {playing ? (
              <iframe
                {...{ credentialless: "" }}
                src={EMBED_URL}
                title="UseFrame demo — YouTube video player"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              <button
                ref={playRef}
                type="button"
                className={styles.playButton}
                onClick={() => setPlaying(true)}
                aria-label="Play UseFrame demo"
              >
                {/* YouTube's thumbnail falls back to the existing product artwork when unavailable. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    thumbnailFailed
                      ? "/chat/useframe landing.png"
                      : "https://i.ytimg.com/vi/DhJBlhw8Ye8/maxresdefault.jpg"
                  }
                  alt=""
                  loading="lazy"
                  onError={() => setThumbnailFailed(true)}
                  onLoad={(event) => {
                    if (event.currentTarget.naturalWidth < 200)
                      setThumbnailFailed(true);
                  }}
                />
                <span className={styles.previewShade} />
                <span className={styles.playIcon}>
                  <Play size={26} fill="currentColor" aria-hidden="true" />
                </span>
                <span className={styles.previewCaption}>
                  A little inspiration.
                  <br />A clearer starting point.
                </span>
              </button>
            )}
          </div>
          <div className={styles.videoFooter}>
            <div>
              <h3>Watch our demo</h3>
              <p>Explore the workflow behind your next website.</p>
            </div>
            {playing ? (
              <button
                className={styles.closeButton}
                type="button"
                onClick={() => {
                  setPlaying(false);
                  requestAnimationFrame(() => playRef.current?.focus());
                }}
                aria-label="Close demo video"
              >
                <X size={18} />
              </button>
            ) : (
              <span className={styles.footerIcon} aria-hidden="true">
                <ArrowUpRight size={20} />
              </span>
            )}
          </div>
          {playing && (
            <p className={styles.fallback}>
              Having trouble playing?{" "}
              <a href={VIDEO_URL} target="_blank" rel="noopener noreferrer">
                Watch on YouTube <ArrowUpRight size={12} aria-hidden="true" />
              </a>
            </p>
          )}
        </FloatingCard>

        {CARDS.map((card, index) => (
          <FloatingCard
            key={card.id}
            id={card.id}
            label={card.title}
            className={`${styles.featureCard} ${styles[card.id]}`}
            depth={card.depth}
            tilt={card.tilt}
            index={index + 1}
            progress={scrollYProgress}
            active={active}
            reduced={reduced}
            onHover={setHovered}
            onFocus={setFocused}
          >
            <span className={styles.featureTop}>
              <span className={styles.featureIcon}>
                <card.icon size={18} aria-hidden="true" />
              </span>
              <span>0{index + 1}</span>
            </span>
            <span className={styles.featureTitle}>{card.title}</span>
            <span className={styles.featureLabel}>{card.label}</span>
            <span className={styles.featureDescription}>
              {card.description}
            </span>
            <span className={styles.miniList}>
              {card.lines.map((line) => (
                <span key={line}>
                  <Check size={12} aria-hidden="true" />
                  {line}
                </span>
              ))}
            </span>
            <span className={styles.featureHint}>
              Explore the possibilities{" "}
              <ArrowUpRight size={13} aria-hidden="true" />
            </span>
          </FloatingCard>
        ))}
      </div>
      <p className={styles.sectionNote}>
        A thoughtful starting point. A website that feels like you.
      </p>
    </section>
  );
});
