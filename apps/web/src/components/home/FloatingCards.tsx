"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { CryptoWalletCard } from "./cards/CryptoWalletCard";
import { ProjectOverviewCard } from "./cards/ProjectOverviewCard";
import { RecentFilesCard } from "./cards/RecentFilesCard";
import { AnalyticsCard } from "./cards/AnalyticsCard";
import { TeamCollabCard } from "./cards/TeamCollabCard";
import { InvoiceCard } from "./cards/InvoiceCard";

const FLOATING = [
  { id: "crypto", Card: CryptoWalletCard, posClass: "left-[3%] top-[13%]", rotate: -2, duration: 7, delay: 0 },
  { id: "project", Card: ProjectOverviewCard, posClass: "left-[5.5%] top-[40%]", rotate: 1.5, duration: 8, delay: 0.6 },
  { id: "files", Card: RecentFilesCard, posClass: "left-[3%] top-[62%]", rotate: -1.5, duration: 6.5, delay: 1.1 },
  { id: "analytics", Card: AnalyticsCard, posClass: "right-[3%] top-[13%]", rotate: 2, duration: 7.5, delay: 0.3 },
  { id: "team", Card: TeamCollabCard, posClass: "right-[3.5%] top-[44%]", rotate: -1.5, duration: 6.8, delay: 0.9 },
  { id: "invoice", Card: InvoiceCard, posClass: "right-[6%] top-[64%]", rotate: 1.5, duration: 8.5, delay: 1.4 },
];

export const FloatingCards = memo(function FloatingCards() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-5 hidden xl:block">
      {FLOATING.map(({ id, Card, posClass, rotate, duration, delay }, i) => (
        <motion.div
          key={id}
          className={`pointer-events-auto absolute ${posClass}`}
          initial={{ opacity: 0, y: 24, rotate, scale: 0.94 }}
          animate={{ opacity: 1, y: [0, -8, 0], rotate, scale: 1 }}
          whileHover={{ rotate: 0, scale: 1.04, zIndex: 20 }}
          transition={{
            opacity: { duration: 0.8, delay: 0.2 + i * 0.12 },
            scale: { duration: 0.8, delay: 0.2 + i * 0.12 },
            y: { duration, repeat: Infinity, ease: "easeInOut", delay },
          }}
        >
          <Card />
        </motion.div>
      ))}
    </div>
  );
});
