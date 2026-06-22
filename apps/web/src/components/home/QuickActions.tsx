"use client";

import { memo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const ACTIONS = [
  { label: "Analyse Competitor", circleClass: "bg-orange-500" },
  { label: "Analyse Website", circleClass: "bg-green-500" },
  { label: "Build New", circleClass: "bg-yellow-400" },
];

export const QuickActions = memo(function QuickActions() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.4, ease: "easeOut" }}
      className="relative z-10 mt-6 flex flex-wrap items-center justify-center gap-3"
    >
      {ACTIONS.map((action) => (
        <Link
          key={action.label}
          href="/signin"
          className="group inline-flex items-center gap-2.5 rounded-full bg-white py-1.5 pl-4 pr-1.5 text-[13px] font-medium text-slate-800 shadow-md shadow-sky-950/5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
        >
          {action.label}
          <span className={`flex size-6 items-center justify-center rounded-full ${action.circleClass} text-white transition-transform group-hover:translate-x-0.5`}>
            <ArrowRight className="size-3" />
          </span>
        </Link>
      ))}
    </motion.div>
  );
});
