"use client";

import { memo, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { ArrowUpRight, BarChart3, FileSearch, Globe } from "lucide-react";
import styles from "./ResearchSection.module.css";

const FEATURES = [
  {
    id: "research",
    icon: FileSearch,
    title: "Deep Search",
    description:
      "Long-form market and audience research, summarised into action items. UseFrame reads hundreds of sources and hands you a structured brief you can ship from.",
  },
  {
    id: "competitor",
    icon: BarChart3,
    title: "Competitor Analysis",
    description:
      "Benchmark any competitor's positioning, pricing and funnel in one click. Understand gaps, opportunities and what makes them win — before you even write a line of code.",
  },
  {
    id: "scoring",
    icon: Globe,
    title: "Website Score",
    description:
      "Audit performance, UX and conversion signals with an AI web score. Get a prioritised fix list with estimated revenue impact for every issue we find.",
  },
] as const;

const EASE = [0.22, 1, 0.36, 1] as const;

export const ResearchSection = memo(function ResearchSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const grainId = useId();
  const reducedMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const rawY = useTransform(scrollYProgress, [0, 1], [28, -28]);
  const imageY = useSpring(rawY, { stiffness: 60, damping: 20, mass: 0.6 });
  const feature = FEATURES[active];

  return (
    <div ref={sectionRef} data-research-card className={styles.section}>
      <div className={styles.frame}>
        <div className={styles.photo} aria-hidden="true">
          <motion.div
            className={styles.parallax}
            style={{ y: reducedMotion ? 0 : imageY }}
          >
            <motion.div
              className={styles.image}
              initial={{ scale: reducedMotion ? 1 : 1.1 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: reducedMotion ? 0 : 1.4, ease: EASE }}
            >
              <Image
                src="/chat/useframecloud.jpg"
                alt=""
                fill
                sizes="(min-width: 1024px) 68vw, 94vw"
                className="object-cover"
              />
            </motion.div>
          </motion.div>
          <div className={styles.shade} />
        </div>

        <div className={styles.actions}>
          <motion.div
            className={styles.actionButtons}
            initial={{
              opacity: reducedMotion ? 1 : 0,
              y: reducedMotion ? 0 : -12,
            }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: reducedMotion ? 0 : 0.6, ease: EASE }}
          >
            <Link href="/research" className={styles.secondaryButton}>
              Learn More
            </Link>
            <Link href="/signin" className={styles.primaryButton}>
              Get Started <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </motion.div>
        </div>

        <div className={styles.heading}>
          <p className={styles.eyebrow}>UseFrame / Research</p>
          <h3 aria-label="Know the market before you build">
            {["Know the market", "before you build."].map((line, index) => (
              <span key={line} className={styles.line} aria-hidden="true">
                <motion.span
                  initial={{
                    y: reducedMotion ? 0 : "105%",
                    opacity: reducedMotion ? 1 : 0,
                  }}
                  whileInView={{ y: 0, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: reducedMotion ? 0 : 0.8,
                    delay: reducedMotion ? 0 : index * 0.12,
                    ease: EASE,
                  }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h3>
          <p className={styles.intro}>
            UseFrame turns scattered signals into clear, structured research you
            can act on.
          </p>
        </div>

        <div className={styles.featurePanel}>
          <motion.div
            id="research-features"
            role="region"
            aria-label="Research features"
            className={styles.card}
            initial={{
              opacity: reducedMotion ? 1 : 0,
              y: reducedMotion ? 0 : 16,
            }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: reducedMotion ? 0 : 0.65, ease: EASE }}
          >
            <svg
              aria-hidden="true"
              className={styles.grain}
              xmlns="http://www.w3.org/2000/svg"
            >
              <filter
                id={grainId}
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
              <rect width="100%" height="100%" filter={`url(#${grainId})`} />
            </svg>
            <div className={styles.cardContent}>
              <p className={styles.cardLabel}>
                Research / A clearer starting point
              </p>
              <div className={styles.features}>
                {FEATURES.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{
                      opacity: reducedMotion ? 1 : 0,
                      y: reducedMotion ? 0 : 12,
                    }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{
                      duration: reducedMotion ? 0 : 0.5,
                      delay: reducedMotion ? 0 : index * 0.1,
                      ease: EASE,
                    }}
                  >
                    <button
                      type="button"
                      aria-pressed={active === index}
                      aria-controls="research-description"
                      onClick={() => setActive(index)}
                      className={styles.featureButton}
                    >
                      <item.icon size={17} aria-hidden="true" />
                      <span>{item.title}</span>
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </button>
                  </motion.div>
                ))}
              </div>
              <div
                id="research-description"
                className={styles.description}
                aria-live="polite"
                aria-atomic="true"
              >
                {FEATURES.map((item, index) => (
                  <p
                    key={item.id}
                    style={{
                      gridArea: "1 / 1",
                      visibility: active === index ? "visible" : "hidden",
                    }}
                    aria-hidden={active !== index}
                  >
                    {item.description}
                  </p>
                ))}
              </div>
              <Link href="/signin" className={styles.tryLink}>
                Try {feature.title}{" "}
                <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
});
