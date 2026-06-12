"use client";

import { memo } from "react";
import { CryptoWalletCard } from "./cards/CryptoWalletCard";
import { ProjectOverviewCard } from "./cards/ProjectOverviewCard";
import { RecentFilesCard } from "./cards/RecentFilesCard";
import { AnalyticsCard } from "./cards/AnalyticsCard";
import { TeamCollabCard } from "./cards/TeamCollabCard";
import { InvoiceCard } from "./cards/InvoiceCard";

// in-flow fallback for the floating cards on screens below xl
export const ShowcaseGrid = memo(function ShowcaseGrid() {
  return (
    <div className="mt-12 flex w-full flex-wrap items-start justify-center gap-4 xl:hidden">
      <CryptoWalletCard />
      <AnalyticsCard />
      <ProjectOverviewCard />
      <TeamCollabCard />
      <RecentFilesCard />
      <InvoiceCard />
    </div>
  );
});
