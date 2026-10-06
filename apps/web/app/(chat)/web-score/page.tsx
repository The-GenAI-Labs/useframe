import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata(
  "Website Analysis",
  "Assess a website's design, usability, and SEO to identify practical improvements with useframe.",
);

import WebScoreView from "@/components/web-score/WebScoreView";
import { PageFadeIn } from "@/components/shared/PageFadeIn";

export default function WebScorePage() {
  return (
    <PageFadeIn>
      <WebScoreView />
    </PageFadeIn>
  );
}
