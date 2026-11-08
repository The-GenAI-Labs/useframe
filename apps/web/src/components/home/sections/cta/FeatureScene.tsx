"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Accessibility,
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleCheck,
  Clock,
  FileText,
  Gauge,
  Globe,
  Lock,
  Palette,
  RotateCcw,
  Rocket,
  Search,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { landingFont as serif } from "../../fonts";

type SceneProps = { rgb: string; reduced: boolean };

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const SANS =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const INK = "#0f172a";
const TEXT = "#475569";
const MUTED = "#7c8ba3";
const LINE = "#e6eaf2";
const TRACK = "#edf1f7";
const GREEN = "#10b981";
const AMBER = "#f59e0b";
const RED = "#ef4444";

const tr = (reduced: boolean, delay = 0, duration = 0.5) =>
  reduced ? { duration: 0 } : { delay, duration, ease: EASE };
const loop = (reduced: boolean, duration: number, delay = 0) =>
  reduced
    ? { duration: 0 }
    : { delay, duration, repeat: Infinity, ease: "easeInOut" as const };
const from = <T,>(reduced: boolean, value: T) => (reduced ? false : value);

function useTyped(text: string, delayMs: number, reduced: boolean) {
  const [count, setCount] = useState(reduced ? text.length : 0);
  useEffect(() => {
    if (reduced) {
      setCount(text.length);
      return;
    }
    setCount(0);
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      let i = 0;
      timer = setInterval(() => {
        i += 1;
        setCount(i);
        if (i >= text.length) clearInterval(timer);
      }, 45);
    }, delayMs);
    return () => {
      clearTimeout(start);
      if (timer) clearInterval(timer);
    };
  }, [text, delayMs, reduced]);
  return text.slice(0, count);
}

function Icon({
  icon: Glyph,
  x,
  y,
  size = 14,
  color,
  weight = 1.8,
}: {
  icon: LucideIcon;
  x: number;
  y: number;
  size?: number;
  color: string;
  weight?: number;
}) {
  return (
    <Glyph
      x={x}
      y={y}
      width={size}
      height={size}
      color={color}
      strokeWidth={weight}
      aria-hidden
    />
  );
}

function Glass({
  sid,
  x,
  y,
  w,
  h,
  r = 14,
  stroke,
}: {
  sid: string;
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  stroke?: { color: string; opacity: number; dash: string };
}) {
  const clip = `${sid}-clip-${x}-${y}`;
  return (
    <g>
      <clipPath id={clip}>
        <rect x={x} y={y} width={w} height={h} rx={r} />
      </clipPath>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={r}
        fill={`url(#${sid}-glass)`}
        filter={`url(#${sid}-sh)`}
      />
      <path
        d={`M${x} ${y} H${x + w * 0.62} L${x + w * 0.26} ${y + h} H${x} Z`}
        fill={`url(#${sid}-sheen)`}
        clipPath={`url(#${clip})`}
      />
      {stroke && (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={r}
          fill="none"
          stroke={stroke.color}
          strokeOpacity={stroke.opacity}
          strokeWidth="1.5"
          strokeDasharray={stroke.dash}
        />
      )}
    </g>
  );
}

function Stage({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 460 259"
      className="relative z-10 block aspect-video w-full"
      role="img"
      aria-label={label}
      style={{ fontFamily: SANS }}
    >
      <defs>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.93" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.05" />
        </linearGradient>
        <filter id={`${id}-sh`} x="-10%" y="-10%" width="120%" height="135%">
          <feDropShadow
            dx="0"
            dy="3"
            stdDeviation="6"
            floodColor="#0a1a4f"
            floodOpacity="0.2"
          />
        </filter>
      </defs>
      {children}
    </svg>
  );
}

function LandingScene({ rgb, reduced }: SceneProps) {
  const accent = `rgb(${rgb})`;
  const line1 = useTyped("Fresh bread,", 500, reduced);
  const line2 = useTyped("baked daily.", 1150, reduced);
  return (
    <Stage
      id="land"
      label="A landing page taking shape from a short chat request"
    >
      <defs>
        <clipPath id="land-art-clip">
          <rect x="244" y="84" width="166" height="118" rx="14" />
        </clipPath>
        <clipPath id="land-win">
          <rect x="34" y="22" width="392" height="206" rx="14" />
        </clipPath>
        <linearGradient id="land-art" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={accent} />
          <stop offset="1" stopColor={accent} stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <Glass sid="land" x={34} y={22} w={392} h={206} />
      <g clipPath="url(#land-win)">
        <rect
          x="34"
          y="22"
          width="392"
          height="28"
          fill="#f1f5f9"
          opacity="0.7"
        />
        <rect x="34" y="50" width="392" height="1" fill={LINE} />
      </g>
      {[50, 61, 72].map((cx) => (
        <circle key={cx} cx={cx} cy="36" r="3" fill="#dfe4ec" />
      ))}
      <rect
        x="150"
        y="28"
        width="160"
        height="16"
        rx="8"
        fill="#fff"
        stroke={LINE}
      />
      <Icon icon={Lock} x={159} y={32} size={8} color={MUTED} />
      <text x="173" y="39.4" fontSize="8.5" fill={TEXT}>
        yourbrand.useframe.in
      </text>

      <rect x="52" y="61" width="12" height="12" rx="4" fill={accent} />
      <text x="70" y="71" fontSize="9.5" fontWeight="700" fill={INK}>
        Yourbrand
      </text>
      {[
        { x: 310, t: "Menu" },
        { x: 338, t: "About" },
        { x: 370, t: "Contact" },
      ].map((l) => (
        <text key={l.t} x={l.x} y="71" fontSize="8.5" fill={MUTED}>
          {l.t}
        </text>
      ))}

      <text
        x="52"
        y="98"
        fontSize="7.5"
        fontWeight="700"
        letterSpacing="1.3"
        fill={accent}
      >
        FRESH EVERY MORNING
      </text>
      <text
        x="52"
        y="125"
        fontSize="25"
        fill={INK}
        style={{ fontFamily: serif.style.fontFamily }}
      >
        {line1}
      </text>
      <text
        x="52"
        y="152"
        fontSize="25"
        fill={INK}
        style={{ fontFamily: serif.style.fontFamily }}
      >
        {line2}
      </text>
      <motion.g
        initial={from(reduced, { opacity: 0 })}
        animate={{ opacity: 1 }}
        transition={tr(reduced, 1.7)}
      >
        <rect x="52" y="164" width="150" height="5" rx="2.5" fill="#e8edf4" />
        <rect x="52" y="175" width="112" height="5" rx="2.5" fill="#e8edf4" />
      </motion.g>
      <motion.g
        initial={from(reduced, { opacity: 0, y: 6 })}
        animate={{ opacity: 1, y: 0 }}
        transition={tr(reduced, 2)}
      >
        <rect x="52" y="190" width="88" height="26" rx="13" fill={accent} />
        <text
          x="96"
          y="206.6"
          fontSize="10"
          fontWeight="700"
          textAnchor="middle"
          fill="#fff"
        >
          Order now
        </text>
        <text x="153" y="206.6" fontSize="10" fontWeight="600" fill={TEXT}>
          See menu
        </text>
        <Icon icon={ArrowRight} x={198} y={199} size={11} color={TEXT} />
      </motion.g>

      <motion.g
        initial={from(reduced, { opacity: 0, scale: 0.96 })}
        animate={{ opacity: 1, scale: 1 }}
        transition={tr(reduced, 0.4, 0.6)}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        <rect
          x="244"
          y="84"
          width="166"
          height="118"
          rx="14"
          fill="url(#land-art)"
        />
        <g clipPath="url(#land-art-clip)">
          <circle cx="388" cy="96" r="44" fill="#fff" opacity="0.13" />
          <circle cx="258" cy="204" r="52" fill="#fff" opacity="0.1" />
          <circle
            cx="326"
            cy="122"
            r="28"
            fill="none"
            stroke="#fff"
            strokeOpacity="0.55"
            strokeWidth="1.5"
          />
          <circle cx="326" cy="122" r="17" fill="#fff" opacity="0.22" />
          <motion.circle
            cx="326"
            cy="122"
            r="5"
            fill="#fff"
            animate={reduced ? undefined : { scale: [1, 1.5, 1] }}
            transition={loop(reduced, 2.6)}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        </g>
      </motion.g>
      <motion.g
        initial={from(reduced, { opacity: 0, y: 10 })}
        animate={{ opacity: 1, y: 0 }}
        transition={tr(reduced, 1.2)}
      >
        <rect
          x="256"
          y="160"
          width="116"
          height="34"
          rx="10"
          fill="#fff"
          filter="url(#land-sh)"
        />
        <rect
          x="264"
          y="168"
          width="18"
          height="18"
          rx="6"
          fill={accent}
          opacity="0.14"
        />
        <Icon icon={Sparkles} x={267} y={171} size={12} color={accent} />
        <text x="290" y="175" fontSize="8.5" fontWeight="700" fill={INK}>
          Sourdough loaf
        </text>
        <text x="290" y="186" fontSize="7.5" fill={MUTED}>
          $6.50 · Fresh today
        </text>
      </motion.g>

      <motion.g
        initial={from(reduced, { opacity: 0, x: 22 })}
        animate={{ opacity: 1, x: 0 }}
        transition={
          reduced
            ? { duration: 0 }
            : { delay: 2.5, type: "spring", stiffness: 200, damping: 18 }
        }
      >
        <rect
          x="232"
          y="206"
          width="190"
          height="30"
          rx="15"
          fill={INK}
          filter="url(#land-sh)"
        />
        <Icon icon={Sparkles} x={245} y={214} size={14} color="#fff" />
        <text x="266" y="224.4" fontSize="9.5" fontWeight="600" fill="#fff">
          Make the hero bolder
        </text>
      </motion.g>
    </Stage>
  );
}

function SeoScene({ rgb, reduced }: SceneProps) {
  const accent = `rgb(${rgb})`;
  const query = useTyped("best bakery near me", 300, reduced);
  const checks = [
    { text: "Title length", tag: "Ideal" },
    { text: "Meta description", tag: "Added" },
    { text: "Heading structure", tag: "Clear" },
  ];
  return (
    <Stage
      id="seo"
      label="A search result being improved, with a growing SEO score"
    >
      <Glass sid="seo" x={34} y={20} w={392} h={116} />
      <rect x="48" y="32" width="364" height="26" rx="13" fill="#f1f5f9" />
      <Icon icon={Search} x={60} y={39} size={12} color={MUTED} />
      <text x="80" y="49" fontSize="10.5" fill={INK}>
        {query}
      </text>

      <motion.g
        initial={from(reduced, { opacity: 0, y: 8 })}
        animate={{ opacity: 1, y: 0 }}
        transition={tr(reduced, 1.2)}
      >
        <rect x="48" y="69" width="16" height="16" rx="8" fill="#f1f5f9" />
        <Icon icon={Globe} x={51} y={72} size={10} color={accent} />
        <text x="70" y="80.5" fontSize="8.5" fill={TEXT}>
          yourbrand.useframe.in › bakery
        </text>
        <text x="48" y="101" fontSize="13.5" fontWeight="600" fill="#1d4ed8">
          Fresh Bread Baked Daily | Your Brand
        </text>
        <motion.rect
          x="48"
          y="105"
          width="244"
          height="2"
          rx="1"
          fill={accent}
          opacity="0.5"
          initial={from(reduced, { scaleX: 0 })}
          animate={{ scaleX: 1 }}
          transition={tr(reduced, 1.9, 0.7)}
          style={{ transformBox: "fill-box", transformOrigin: "left" }}
        />
        <rect x="48" y="113" width="330" height="4" rx="2" fill="#edf1f7" />
        <rect x="48" y="122" width="240" height="4" rx="2" fill="#edf1f7" />
      </motion.g>

      <Glass sid="seo" x={34} y={148} w={226} h={84} />
      {checks.map((c, i) => {
        const cy = 166 + i * 24;
        const delay = 2 + i * 0.45;
        return (
          <g key={c.text}>
            {i > 0 && (
              <rect x="48" y={cy - 12} width="198" height="1" fill={LINE} />
            )}
            <motion.g
              initial={from(reduced, { scale: 0 })}
              animate={{ scale: 1 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { delay, type: "spring", stiffness: 320, damping: 16 }
              }
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            >
              <Icon
                icon={CircleCheck}
                x={48}
                y={cy - 7}
                size={14}
                color={accent}
              />
            </motion.g>
            <motion.g
              initial={from(reduced, { opacity: 0, x: -6 })}
              animate={{ opacity: 1, x: 0 }}
              transition={tr(reduced, delay)}
            >
              <text
                x="70"
                y={cy + 3.6}
                fontSize="10.5"
                fontWeight="500"
                fill={TEXT}
              >
                {c.text}
              </text>
              <text
                x="246"
                y={cy + 3.4}
                fontSize="8.5"
                fontWeight="600"
                textAnchor="end"
                fill={MUTED}
              >
                {c.tag}
              </text>
            </motion.g>
          </g>
        );
      })}

      <Glass sid="seo" x={272} y={148} w={154} h={84} />
      <circle
        cx="312"
        cy="190"
        r="25"
        fill="none"
        stroke={TRACK}
        strokeWidth="6"
      />
      <g transform="rotate(-90 312 190)">
        <motion.circle
          cx="312"
          cy="190"
          r="25"
          fill="none"
          stroke={accent}
          strokeWidth="6"
          strokeLinecap="round"
          initial={from(reduced, { pathLength: 0 })}
          animate={{ pathLength: 0.92 }}
          transition={tr(reduced, 2.2, 1.3)}
        />
      </g>
      <text
        x="312"
        y="195.6"
        fontSize="16"
        fontWeight="800"
        textAnchor="middle"
        fill={INK}
      >
        92
      </text>
      <text x="348" y="184" fontSize="8.5" fill={MUTED}>
        SEO score
      </text>
      <text x="348" y="200" fontSize="11" fontWeight="700" fill={accent}>
        Excellent
      </text>
    </Stage>
  );
}

function DomainScene({ rgb, reduced }: SceneProps) {
  const accent = `rgb(${rgb})`;
  const host = useTyped("yourbrand.useframe.in", 350, reduced);
  return (
    <Stage
      id="dom"
      label="A site live on a subdomain with a custom domain waiting for DNS verification"
    >
      <Glass sid="dom" x={48} y={22} w={364} h={48} />
      <Icon icon={Lock} x={66} y={37} size={16} color={accent} />
      <text x="92" y="51.6" fontSize="14" fontWeight="600" fill={INK}>
        {host}
      </text>
      <motion.g
        initial={from(reduced, { opacity: 0, scale: 0.7 })}
        animate={{ opacity: 1, scale: 1 }}
        transition={tr(reduced, 1.6)}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        <rect x="340" y="36" width="56" height="20" rx="10" fill="#ecfdf5" />
        <motion.circle
          cx="352"
          cy="46"
          r="3"
          fill={GREEN}
          animate={reduced ? undefined : { opacity: [1, 0.35, 1] }}
          transition={loop(reduced, 1.4)}
        />
        <text x="360" y="49.4" fontSize="9" fontWeight="700" fill="#047857">
          Live
        </text>
      </motion.g>

      <motion.path
        d="M230 70 V116"
        stroke="#fff"
        strokeOpacity="0.7"
        strokeWidth="1.5"
        strokeDasharray="3 4"
        fill="none"
        initial={from(reduced, { pathLength: 0 })}
        animate={{ pathLength: 1 }}
        transition={tr(reduced, 1.8, 0.6)}
      />
      <motion.circle
        cx="230"
        r="3.5"
        fill="#fff"
        initial={{ cy: 74, opacity: 0 }}
        animate={
          reduced
            ? { cy: 93, opacity: 1 }
            : { cy: [74, 112], opacity: [0, 1, 1, 0] }
        }
        transition={
          reduced
            ? { duration: 0 }
            : { delay: 2.4, duration: 1.6, repeat: Infinity, ease: "easeInOut" }
        }
      />

      <motion.g
        initial={from(reduced, { opacity: 0, y: 10 })}
        animate={{ opacity: 1, y: 0 }}
        transition={tr(reduced, 2)}
      >
        <Glass
          sid="dom"
          x={48}
          y={116}
          w={364}
          h={48}
          stroke={{ color: accent, opacity: 0.7, dash: "5 4" }}
        />
        <Icon icon={Globe} x={66} y={131} size={16} color={MUTED} />
        <text x="92" y="145.6" fontSize="14" fontWeight="600" fill={TEXT}>
          yourbrand.com
        </text>
        <rect x="336" y="130" width="60" height="20" rx="10" fill={accent} />
        <text
          x="366"
          y="143.6"
          fontSize="9"
          fontWeight="700"
          textAnchor="middle"
          fill="#fff"
        >
          Verify
        </text>
      </motion.g>

      <motion.g
        initial={from(reduced, { opacity: 0, y: 12 })}
        animate={{ opacity: 1, y: 0 }}
        transition={tr(reduced, 2.6)}
      >
        <Glass sid="dom" x={48} y={178} w={364} h={56} />
        {[
          { x: 64, t: "TYPE" },
          { x: 112, t: "NAME" },
          { x: 190, t: "VALUE" },
        ].map((h) => (
          <text
            key={h.t}
            x={h.x}
            y="194"
            fontSize="7.5"
            fontWeight="700"
            letterSpacing="0.9"
            fill={MUTED}
          >
            {h.t}
          </text>
        ))}
        <rect x="64" y="200" width="332" height="1" fill={LINE} />
        {[
          { x: 64, t: "TXT" },
          { x: 112, t: "_useframe" },
          { x: 190, t: "verify=a1b2c3…" },
        ].map((c) => (
          <text
            key={c.t}
            x={c.x}
            y="220"
            fontSize="9.5"
            fill={INK}
            fontFamily={MONO}
          >
            {c.t}
          </text>
        ))}
        <rect x="318" y="208" width="78" height="18" rx="9" fill="#fffbeb" />
        <Icon icon={Clock} x={325} y={212} size={10} color="#b45309" />
        <text x="338" y="220.6" fontSize="8.5" fontWeight="600" fill="#b45309">
          Awaiting DNS
        </text>
      </motion.g>
    </Stage>
  );
}

function DeployScene({ rgb, reduced }: SceneProps) {
  const accent = `rgb(${rgb})`;
  const versions = [
    { id: "v3", note: "Today · 10:42", live: true },
    { id: "v2", note: "Yesterday", live: false },
    { id: "v1", note: "Last week", live: false },
  ];
  return (
    <Stage
      id="dep"
      label="A website being published with earlier versions kept available"
    >
      <Glass sid="dep" x={34} y={24} w={198} h={196} />
      <text
        x="50"
        y="43"
        fontSize="8"
        fontWeight="700"
        letterSpacing="1"
        fill={MUTED}
      >
        VERSIONS
      </text>
      <rect x="50" y="53" width="166" height="1" fill={LINE} />
      <rect x="55" y="80" width="2" height="96" fill={LINE} />
      {versions.map((v, i) => {
        const cy = 80 + i * 48;
        return (
          <motion.g
            key={v.id}
            initial={from(reduced, { opacity: 0, x: -12 })}
            animate={{ opacity: 1, x: 0 }}
            transition={tr(reduced, 0.2 + (2 - i) * 0.25)}
          >
            {i > 0 && (
              <rect x="50" y={cy - 24} width="166" height="1" fill={LINE} />
            )}
            {v.live && (
              <circle cx="56" cy={cy} r="8" fill={accent} opacity="0.16" />
            )}
            <circle
              cx="56"
              cy={cy}
              r="4.5"
              fill={v.live ? accent : "#fff"}
              stroke={v.live ? accent : "#cbd5e1"}
              strokeWidth="2"
            />
            <text x="76" y={cy - 1} fontSize="12" fontWeight="700" fill={INK}>
              {v.id}
            </text>
            <text x="76" y={cy + 12} fontSize="8.5" fill={MUTED}>
              {v.note}
            </text>
            {v.live ? (
              <>
                <rect
                  x="174"
                  y={cy - 9}
                  width="42"
                  height="18"
                  rx="9"
                  fill="#ecfdf5"
                />
                <text
                  x="195"
                  y={cy + 3.4}
                  fontSize="9"
                  fontWeight="700"
                  textAnchor="middle"
                  fill="#047857"
                >
                  Live
                </text>
              </>
            ) : (
              <>
                <Icon
                  icon={RotateCcw}
                  x={166}
                  y={cy - 6}
                  size={11}
                  color={accent}
                />
                <text
                  x="180"
                  y={cy + 3.4}
                  fontSize="9"
                  fontWeight="600"
                  fill={accent}
                >
                  Restore
                </text>
              </>
            )}
          </motion.g>
        );
      })}

      <Glass sid="dep" x={246} y={24} w={180} h={196} />
      <circle
        cx="336"
        cy="94"
        r="36"
        fill="none"
        stroke={TRACK}
        strokeWidth="5"
      />
      <g transform="rotate(-90 336 94)">
        <motion.circle
          cx="336"
          cy="94"
          r="36"
          fill="none"
          stroke={accent}
          strokeWidth="5"
          strokeLinecap="round"
          initial={from(reduced, { pathLength: 0 })}
          animate={{ pathLength: 1 }}
          transition={tr(reduced, 0.8, 2.3)}
        />
        <motion.circle
          cx="336"
          cy="94"
          r="36"
          fill="none"
          stroke={GREEN}
          strokeWidth="5"
          initial={{ opacity: reduced ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={tr(reduced, 3.1, 0.4)}
        />
      </g>
      <motion.g
        initial={{ opacity: reduced ? 0 : 1 }}
        animate={{ opacity: 0 }}
        transition={tr(reduced, 3.1, 0.3)}
      >
        <motion.g
          animate={reduced ? undefined : { y: [0, -2.5, 0] }}
          transition={loop(reduced, 2)}
        >
          <Icon
            icon={Rocket}
            x={321}
            y={79}
            size={30}
            color={INK}
            weight={1.6}
          />
        </motion.g>
      </motion.g>
      <motion.g
        initial={from(reduced, { opacity: 0, scale: 0.6 })}
        animate={{ opacity: 1, scale: 1 }}
        transition={tr(reduced, 3.2, 0.4)}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        <Icon
          icon={Check}
          x={321}
          y={79}
          size={30}
          color={GREEN}
          weight={2.2}
        />
      </motion.g>

      <motion.text
        x="336"
        y="158"
        fontSize="11"
        fontWeight="600"
        textAnchor="middle"
        fill={TEXT}
        initial={{ opacity: reduced ? 0 : 1 }}
        animate={{ opacity: 0 }}
        transition={tr(reduced, 3.1, 0.3)}
      >
        Publishing…
      </motion.text>
      <motion.g
        initial={from(reduced, { opacity: 0, y: 4 })}
        animate={{ opacity: 1, y: 0 }}
        transition={tr(reduced, 3.3)}
      >
        <text
          x="336"
          y="158"
          fontSize="11.5"
          fontWeight="700"
          textAnchor="middle"
          fill={INK}
        >
          Your site is live
        </text>
        <text
          x="336"
          y="173"
          fontSize="8.5"
          textAnchor="middle"
          fill={MUTED}
          fontFamily={MONO}
        >
          yourbrand.useframe.in
        </text>
      </motion.g>
      <motion.g
        initial={from(reduced, { opacity: 0, y: 6 })}
        animate={{ opacity: 1, y: 0 }}
        transition={tr(reduced, 3.6)}
      >
        <rect x="294" y="184" width="84" height="24" rx="12" fill={accent} />
        <text
          x="328"
          y="199.6"
          fontSize="9.5"
          fontWeight="700"
          textAnchor="middle"
          fill="#fff"
        >
          View site
        </text>
        <Icon
          icon={ArrowUpRight}
          x={355}
          y={190}
          size={11}
          color="#fff"
          weight={2.2}
        />
      </motion.g>
    </Stage>
  );
}

const SCORES: Array<{ label: string; value: number; icon: LucideIcon }> = [
  { label: "Design", value: 92, icon: Palette },
  { label: "Accessibility", value: 96, icon: Accessibility },
  { label: "Content", value: 68, icon: FileText },
  { label: "SEO", value: 90, icon: Search },
  { label: "Performance", value: 82, icon: Gauge },
];

const scoreColor = (value: number) =>
  value >= 85 ? GREEN : value >= 70 ? AMBER : RED;

function ScoreScene({ rgb, reduced }: SceneProps) {
  const accent = `rgb(${rgb})`;
  return (
    <Stage
      id="score"
      label="A web score broken down by design, accessibility, content, SEO and performance"
    >
      <defs>
        <linearGradient id="score-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={GREEN} />
          <stop offset="1" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <Glass sid="score" x={34} y={24} w={172} h={206} />
      <circle
        cx="120"
        cy="110"
        r="50"
        fill="none"
        stroke={TRACK}
        strokeWidth="8"
      />
      <g transform="rotate(-90 120 110)">
        <motion.circle
          cx="120"
          cy="110"
          r="50"
          fill="none"
          stroke="url(#score-ring)"
          strokeWidth="8"
          strokeLinecap="round"
          initial={from(reduced, { pathLength: 0 })}
          animate={{ pathLength: 0.86 }}
          transition={tr(reduced, 0.3, 1.6)}
        />
      </g>
      <motion.g
        initial={from(reduced, { opacity: 0, scale: 0.85 })}
        animate={{ opacity: 1, scale: 1 }}
        transition={tr(reduced, 1.1)}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        <text
          x="120"
          y="123"
          fontSize="40"
          textAnchor="middle"
          fill={INK}
          style={{ fontFamily: serif.style.fontFamily }}
        >
          86
        </text>
        <text x="120" y="139" fontSize="8.5" textAnchor="middle" fill={MUTED}>
          out of 100
        </text>
      </motion.g>
      <rect x="50" y="176" width="140" height="1" fill={LINE} />
      <motion.g
        initial={from(reduced, { opacity: 0, y: 6 })}
        animate={{ opacity: 1, y: 0 }}
        transition={tr(reduced, 2.2)}
      >
        <rect
          x="50"
          y="188"
          width="22"
          height="22"
          rx="7"
          fill={accent}
          opacity="0.14"
        />
        <Icon icon={Zap} x={54} y={192} size={14} color={accent} />
        <text x="80" y="203" fontSize="9.5" fontWeight="600" fill={TEXT}>
          3 quick wins found
        </text>
      </motion.g>

      <Glass sid="score" x={218} y={24} w={208} h={206} />
      {SCORES.map((s, i) => {
        const cy = 54 + i * 36;
        const delay = 0.5 + i * 0.18;
        return (
          <g key={s.label}>
            <motion.g
              initial={from(reduced, { opacity: 0 })}
              animate={{ opacity: 1 }}
              transition={tr(reduced, delay)}
            >
              <rect
                x="232"
                y={cy - 12}
                width="24"
                height="24"
                rx="8"
                fill="#f6f8fb"
              />
              <Icon icon={s.icon} x={238} y={cy - 6} size={12} color={TEXT} />
              <text
                x="266"
                y={cy - 1}
                fontSize="9.5"
                fontWeight="600"
                fill={TEXT}
              >
                {s.label}
              </text>
            </motion.g>
            <rect
              x="266"
              y={cy + 4}
              width="120"
              height="5"
              rx="2.5"
              fill={TRACK}
            />
            <motion.rect
              x="266"
              y={cy + 4}
              width={(120 * s.value) / 100}
              height="5"
              rx="2.5"
              fill={scoreColor(s.value)}
              initial={from(reduced, { scaleX: 0 })}
              animate={{ scaleX: 1 }}
              transition={tr(reduced, delay, 0.9)}
              style={{ transformBox: "fill-box", transformOrigin: "left" }}
            />
            <motion.text
              x="412"
              y={cy + 9}
              fontSize="10.5"
              fontWeight="700"
              textAnchor="end"
              fill={INK}
              initial={from(reduced, { opacity: 0 })}
              animate={{ opacity: 1 }}
              transition={tr(reduced, delay + 0.6)}
            >
              {s.value}
            </motion.text>
          </g>
        );
      })}
    </Stage>
  );
}

const SCENES = {
  landing: LandingScene,
  seo: SeoScene,
  domain: DomainScene,
  deployment: DeployScene,
  score: ScoreScene,
} as const;

export function FeatureScene({
  id,
  accentRgb,
  reduced,
}: {
  id: keyof typeof SCENES;
  accentRgb: string;
  reduced: boolean;
}) {
  const Scene = SCENES[id];
  return <Scene rgb={accentRgb} reduced={reduced} />;
}
