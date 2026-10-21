"use client";

import { memo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  formatPlanPrice,
  plansApi,
  PLANS_QUERY_KEY,
} from "@/lib/api/services/plans.service";
import { motion } from "framer-motion";
import { Check, ExternalLink } from "lucide-react";
import { SectionHeading } from "../ui/SectionHeading";
import { Parallax } from "../ui/Parallax";

function PlanCardSkeleton() {
  return (
    <div
      className="flex flex-col gap-3 rounded-3xl border-[10px] border-white bg-slate-100 p-6"
      aria-hidden
    >
      <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
      <div className="h-9 w-24 animate-pulse rounded bg-slate-200" />
      <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-3.5 w-full animate-pulse rounded bg-slate-200"
          />
        ))}
      </div>
      <div className="mt-4 h-10 w-full animate-pulse rounded-xl bg-slate-200" />
    </div>
  );
}

export const PricingSection = memo(function PricingSection() {
  const plans = useQuery({
    queryKey: PLANS_QUERY_KEY,
    queryFn: plansApi.list,
    staleTime: 60_000,
  });

  return (
    <section
      id="pricing"
      className="relative z-10 w-full scroll-mt-24 overflow-hidden px-6 py-16 sm:py-24"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-1/2"
        style={{
          maskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.36) 48%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.36) 48%, transparent 100%)",
          backgroundImage:
            "linear-gradient(rgba(37,99,235,0.18) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(37,99,235,0.18) 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-1/2"
        style={{
          maskImage:
            "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.36) 48%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.36) 48%, transparent 100%)",
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
          description="Start with a free generation. Purchase credits when you are ready to create more."
        />

        <Parallax offset={60} className="mt-14">
          {plans.isError ? (
            <div
              role="alert"
              className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-3xl bg-slate-100 p-8 text-center"
            >
              <p className="text-sm text-slate-700">
                We couldn&apos;t load pricing right now.
              </p>
              <button
                type="button"
                onClick={() => plans.refetch()}
                disabled={plans.isFetching}
                className="cursor-pointer rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50"
              >
                {plans.isFetching ? "Retrying…" : "Try again"}
              </button>
            </div>
          ) : (
            <div
              className="mx-auto grid max-w-4xl gap-5 md:grid-cols-3"
              aria-busy={plans.isLoading}
            >
              {plans.isLoading &&
                [0, 1, 2].map((i) => <PlanCardSkeleton key={i} />)}
              {plans.data?.map((plan, i) => (
                <motion.div
                  key={plan.slug}
                  initial={{ opacity: 0, y: 28 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{
                    duration: 0.55,
                    delay: i * 0.1,
                    ease: "easeOut",
                  }}
                  className="relative flex flex-col overflow-hidden rounded-3xl border-[10px] border-white"
                  style={
                    plan.highlighted
                      ? {
                          background:
                            "linear-gradient(135deg, #003FCC 0%, #0057FF 45%, #001A66 100%)",
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
                      <filter
                        id="pricingGrain"
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
                        <feComponentTransfer
                          in="grayNoise"
                          result="contrastNoise"
                        >
                          <feFuncR type="linear" slope="4" intercept="-1.5" />
                          <feFuncG type="linear" slope="4" intercept="-1.5" />
                          <feFuncB type="linear" slope="4" intercept="-1.5" />
                        </feComponentTransfer>
                      </filter>
                      <rect
                        width="100%"
                        height="100%"
                        filter="url(#pricingGrain)"
                      />
                    </svg>
                  )}

                  <div className="relative z-10 flex flex-1 flex-col p-6">
                    <p
                      className={`text-sm font-semibold ${plan.highlighted ? "text-blue-100" : "text-slate-500"}`}
                    >
                      {plan.name}
                    </p>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span
                        className={`text-4xl font-bold tracking-tight ${plan.highlighted ? "text-white" : "text-slate-900"}`}
                      >
                        {formatPlanPrice(plan)}
                      </span>
                      <span
                        className={`text-xs ${plan.highlighted ? "text-blue-200" : "text-slate-400"}`}
                      >
                        one-time credits
                      </span>
                    </div>
                    <p
                      className={`mt-1 text-xs ${plan.highlighted ? "text-blue-100" : "text-slate-500"}`}
                    >
                      {plan.description}
                    </p>

                    <ul className="mt-5 flex-1 space-y-2.5">
                      {plan.features.map((feature) => (
                        <li
                          key={feature}
                          className={`flex items-center gap-2 text-sm ${plan.highlighted ? "text-white" : "text-slate-800"}`}
                        >
                          <Check
                            className={`size-4 shrink-0 ${plan.highlighted ? "text-blue-200" : "text-blue-600"}`}
                          />
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
                      <ExternalLink
                        className="size-3.5 shrink-0"
                        strokeWidth={2}
                      />
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </Parallax>

        <Parallax offset={40} className="mt-6">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.55, delay: 0.3, ease: "easeOut" }}
            className="relative mx-auto flex max-w-4xl flex-col items-center gap-6 overflow-hidden rounded-3xl border-[10px] border-white p-8 sm:flex-row sm:justify-between sm:p-10"
            style={{
              background:
                "linear-gradient(135deg, #0A0A0A 0%, #1A1A1A 55%, #0A0A0A 100%)",
              boxShadow: "0 24px 70px -20px rgba(0,0,0,0.45)",
            }}
          >
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.22]"
              xmlns="http://www.w3.org/2000/svg"
            >
              <filter
                id="freeGrain"
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
                <feComponentTransfer in="grayNoise" result="contrastNoise">
                  <feFuncR type="linear" slope="4" intercept="-1.5" />
                  <feFuncG type="linear" slope="4" intercept="-1.5" />
                  <feFuncB type="linear" slope="4" intercept="-1.5" />
                </feComponentTransfer>
              </filter>
              <rect width="100%" height="100%" filter="url(#freeGrain)" />
            </svg>

            <div className="relative z-10 flex flex-col items-center gap-1.5 text-center sm:items-start sm:text-left">
              <div className="flex items-center gap-2">
                <span className="text-4xl font-bold tracking-tight text-white">
                  $0
                </span>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80">
                  Get started free
                </span>
              </div>
              <p className="max-w-sm text-sm leading-relaxed text-white/60">
                Create your first website for free and explore the research
                behind its design recommendations.
              </p>
            </div>

            <Link
              href="/signin"
              className="relative z-10 inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
            >
              Try it free
              <ExternalLink className="size-3.5 shrink-0" strokeWidth={2} />
            </Link>
          </motion.div>
        </Parallax>
      </div>
    </section>
  );
});
