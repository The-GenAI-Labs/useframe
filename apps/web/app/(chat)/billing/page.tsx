import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata(
  "Billing and Credits",
  "Manage your useframe plan, review credit usage, and keep track of payments.",
);

import BillingView from "@/components/billing/BillingView";
import { PageFadeIn } from "@/components/shared/PageFadeIn";

export default function BillingPage() {
  return (
    <PageFadeIn>
      <BillingView />
    </PageFadeIn>
  );
}
