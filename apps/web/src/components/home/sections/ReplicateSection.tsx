"use client";

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Link2 } from "lucide-react";
import { landingFont } from "../fonts";
import { MODES } from "./replicate/modes";
import styles from "./ReplicateSection.module.css";

const EASE = [0.22, 1, 0.36, 1] as const;

function isHttpUrl(value: string) {
  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    );
    return /^https?:$/.test(url.protocol) && url.hostname.includes(".");
  } catch {
    return false;
  }
}

function Placeholder({
  mode,
  reduced,
}: {
  mode: (typeof MODES)[number];
  reduced: boolean;
}) {
  const Icon = mode.icon;
  return (
    <div className={styles.placeholder}>
      <div className={styles.winBar}>
        <i />
        <i />
        <i />
        <span>yourfavouritesite.com</span>
      </div>
      <div className={styles.winBody}>
        <span className={styles.bar} style={{ width: "58%", height: 14 }} />
        <span className={styles.bar} style={{ width: "36%", height: 14 }} />
        <span className={styles.bar} style={{ width: "72%", marginTop: 14 }} />
        <span className={styles.bar} style={{ width: "54%" }} />
        <div className={styles.cards}>
          <i />
          <i />
          <i />
        </div>
        <motion.div
          className={styles.badge}
          animate={reduced ? undefined : { y: [0, -4, 0] }}
          transition={
            reduced
              ? { duration: 0 }
              : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
          }
        >
          <Icon size={14} color={`rgb(${mode.accent})`} aria-hidden="true" />
          {mode.label}
        </motion.div>
      </div>
    </div>
  );
}

export const ReplicateSection = memo(function ReplicateSection() {
  const router = useRouter();
  const grainId = useId();
  const prefersReducedMotion = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(false);
  const [active, setActive] = useState(0);
  const [url, setUrl] = useState("");
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setReducedMotion(prefersReducedMotion ?? false);
  }, [prefersReducedMotion]);

  const mode = MODES[active] ?? MODES[0];

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (!isHttpUrl(url.trim())) {
        setInvalid(true);
        return;
      }
      router.push("/signin");
    },
    [url, router],
  );

  const onTabKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    setActive((i) => (i + step + MODES.length) % MODES.length);
  }, []);

  return (
    <div id="replicate" className={styles.section}>
      <div className={styles.frame}>
        <motion.div
          className={styles.card}
          initial={{
            opacity: reducedMotion ? 1 : 0,
            y: reducedMotion ? 0 : 16,
          }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
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
                seed="7"
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

          <div className={styles.modes}>
            <div
              role="tablist"
              aria-label="Replication mode"
              className={styles.tabs}
            >
              {MODES.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`replicate-tab-${item.id}`}
                  aria-selected={active === index}
                  aria-controls="replicate-stage"
                  tabIndex={active === index ? 0 : -1}
                  className={styles.tab}
                  onClick={() => setActive(index)}
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onKeyDown={onTabKeyDown}
                >
                  <item.icon size={16} aria-hidden="true" />
                  <span>
                    <span className={styles.prefix}>Replicate </span>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.enter}>
            <Link
              href="/signin"
              className={styles.enterButton}
              aria-label="Get started and replicate a site"
            >
              <ArrowUpRight size={28} aria-hidden="true" />
            </Link>
          </div>

          <div className={styles.copy}>
            <p className={styles.eyebrow}>UseFrame / Replicate</p>
            <h3
              className={`${landingFont.className} ${styles.title}`}
              aria-label="Paste a link. Get a site you own."
            >
              {["Paste a link.", "Get a site you own."].map((line, index) => (
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
              Drop in any public website address. UseFrame reads the page,
              rebuilds it as an editable project, and can host it for you, so
              you can start from a design you already like and make it yours
              through chat.
            </p>

            <form className={styles.urlForm} onSubmit={submit} noValidate>
              <div className={styles.urlBar} data-invalid={invalid}>
                <Link2 size={16} aria-hidden="true" />
                <input
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Website address to replicate"
                  aria-invalid={invalid}
                  aria-describedby="replicate-hint"
                  placeholder="https://your-site.com"
                  className={styles.urlInput}
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    if (invalid) setInvalid(false);
                  }}
                />
                <button type="submit" className={styles.go}>
                  Replicate
                </button>
              </div>
              <p
                id="replicate-hint"
                className={styles.hint}
                data-invalid={invalid}
              >
                {invalid
                  ? "Enter a full website address, for example https://example.com."
                  : "Only replicate sites you own or have permission to copy."}
              </p>
            </form>
          </div>

          <div className={styles.showcase}>
            <div
              id="replicate-stage"
              role="tabpanel"
              aria-labelledby={`replicate-tab-${mode.id}`}
              className={styles.stage}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode.id}
                  initial={{ opacity: 0, scale: reducedMotion ? 1 : 1.03 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.3, ease: EASE }}
                  style={{ position: "absolute", inset: 0 }}
                >
                  {mode.image ? (
                    <Image
                      src={mode.image}
                      alt={`${mode.title} preview`}
                      fill
                      sizes="(min-width: 1024px) 40vw, 90vw"
                      className={styles.stageImage}
                    />
                  ) : (
                    <Placeholder mode={mode} reduced={reducedMotion} />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
            <div className={styles.caption} aria-live="polite">
              <h4>{mode.title}</h4>
              <p>{mode.description}</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
});
