"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { Code2, FolderKanban, LayoutTemplate, ShieldCheck, Sparkles, Users } from "lucide-react";
import { SectionHeading } from "../ui/SectionHeading";
import { Parallax } from "../ui/Parallax";

const FEATURES = [
  {
    icon: Sparkles,
    iconClass: "bg-blue-100 text-blue-600",
    title: "AI Generation",
    description: "Landing pages, UI designs and full SaaS apps from a single prompt.",
  },
  {
    icon: LayoutTemplate,
    iconClass: "bg-orange-100 text-orange-600",
    title: "Landing Pages",
    description: "Conversion-ready pages with copy, layout and assets included.",
  },
  {
    icon: Code2,
    iconClass: "bg-green-100 text-green-600",
    title: "Codebases",
    description: "Clean, production-grade code you can export and own forever.",
  },
  {
    icon: FolderKanban,
    iconClass: "bg-violet-100 text-violet-600",
    title: "Projects",
    description: "Organise every client and idea in structured project spaces.",
  },
  {
    icon: Users,
    iconClass: "bg-amber-100 text-amber-600",
    title: "Collaboration",
    description: "Share, comment and ship together with your whole team.",
  },
  {
    icon: ShieldCheck,
    iconClass: "bg-sky-100 text-sky-600",
    title: "Secure by Default",
    description: "Your data and generated assets stay private and protected.",
  },
];

export const FeaturesSection = memo(function FeaturesSection() {
  return (
    <section id="features" className="relative z-10 mx-auto w-full max-w-7xl scroll-mt-24 px-6 py-24">
      <SectionHeading
        eyebrow="Features"
        title="Everything you need to ship"
        description="One workspace covering the entire journey from idea to deployed product."
      />

      <Parallax offset={60} className="mt-14">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: i * 0.07, ease: "easeOut" }}
              className="rounded-3xl border border-slate-100 bg-white p-6 shadow-md shadow-sky-950/5 transition-shadow hover:shadow-xl"
            >
              <span className={`flex size-10 items-center justify-center rounded-xl ${feature.iconClass}`}>
                <feature.icon className="size-5" />
              </span>
              <p className="mt-4 text-base font-semibold text-slate-900">{feature.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </Parallax>
    </section>
  );
});
