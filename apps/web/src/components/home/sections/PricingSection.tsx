"use client";

import { memo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, ExternalLink } from "lucide-react";
import { SectionHeading } from "../ui/SectionHeading";
import { Parallax } from "../ui/Parallax";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    tagline: "For trying things out",
    features: ["3 projects", "Basic AI generations", "Community templates", "1 workspace"],
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$19",
    tagline: "For serious builders",
    features: ["Unlimited projects", "Advanced AI models", "Competitor analysis", "Custom domains", "Priority support"],
    highlighted: true,
  },
  {
    name: "Pro Max",
    price: "$49",
    tagline: "For growing teams",
    features: ["Everything in Pro", "Unlimited members", "Shared workspaces", "Admin controls", "SSO & audit logs"],
    highlighted: false,
  },
];

export const PricingSection = memo(function PricingSection() {
  return (
    <section id="pricing" className="relative z-10 w-full scroll-mt-24 overflow-hidden px-6 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-0 w-1/2"
        style={{
          maskImage: "linear-gradient(to right, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 40%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to right, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 40%, transparent 100%)",
          backgroundImage:
            "linear-gradient(rgba(37,99,235,0.18) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(37,99,235,0.18) 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-0 w-1/2"
        style={{
          maskImage: "linear-gradient(to left, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 40%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to left, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 40%, transparent 100%)",
          backgroundImage:
            "linear-gradient(rgba(37,99,235,0.18) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(37,99,235,0.18) 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Pricing"
          title="Simple pricing that scales with you"
          description="Start free, upgrade when your ideas need more horsepower."
        />

        <Parallax offset={60} className="mt-14">
          <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-3">
            {PLANS.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.55, delay: i * 0.1, ease: "easeOut" }}
                className="relative flex flex-col overflow-hidden rounded-3xl border-[10px] border-white"
                style={
                  plan.highlighted
                    ? {
                        background: "linear-gradient(135deg, #003FCC 0%, #0057FF 45%, #001A66 100%)",
                        boxShadow: "0 24px 70px -20px rgba(37,99,235,0.55)",
                      }
                    : {
                        background: "#f1f5f9",
                        boxShadow: "0 4px 24px -4px rgba(0,0,0,0.08)",
                      }
                }
              >
                {plan.highlighted && (
                  <svg
                    aria-hidden
                    className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.28]"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <filter id="pricingGrain" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
                      <feTurbulence
                        type="fractalNoise"
                        baseFrequency="0.72 0.68"
                        numOctaves="4"
                        seed="12"
                        stitchTiles="stitch"
                        result="noise"
                      />
                      <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise" />
                      <feComponentTransfer in="grayNoise" result="contrastNoise">
                        <feFuncR type="linear" slope="4" intercept="-1.5" />
                        <feFuncG type="linear" slope="4" intercept="-1.5" />
                        <feFuncB type="linear" slope="4" intercept="-1.5" />
                      </feComponentTransfer>
                    </filter>
                    <rect width="100%" height="100%" filter="url(#pricingGrain)" />
                  </svg>
                )}

                <div className="relative z-10 flex flex-1 flex-col p-6">
                  <p className={`text-sm font-semibold ${plan.highlighted ? "text-blue-100" : "text-slate-500"}`}>
                    {plan.name}
                  </p>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className={`text-4xl font-bold tracking-tight ${plan.highlighted ? "text-white" : "text-slate-900"}`}>
                      {plan.price}
                    </span>
                    <span className={`text-xs ${plan.highlighted ? "text-blue-200" : "text-slate-400"}`}>/month</span>
                  </div>
                  <p className={`mt-1 text-xs ${plan.highlighted ? "text-blue-100" : "text-slate-500"}`}>{plan.tagline}</p>

                  <ul className="mt-5 flex-1 space-y-2.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className={`flex items-center gap-2 text-sm ${plan.highlighted ? "text-white" : "text-slate-800"}`}>
                        <Check className={`size-4 shrink-0 ${plan.highlighted ? "text-blue-200" : "text-blue-600"}`} />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/signin"
                    className={`mt-6 inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5 ${
                      plan.highlighted
                        ? "bg-white text-blue-700 shadow-lg hover:shadow-xl"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    Get started
                    <ExternalLink className="size-3.5 shrink-0" strokeWidth={2} />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </Parallax>
      </div>
    </section>
  );
});
