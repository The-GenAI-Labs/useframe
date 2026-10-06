import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata(
  "Design Research",
  "Explore research findings that inform layout, content, and design decisions in useframe.",
);

import ResearchView from "@/components/research/ResearchView";
import { PageFadeIn } from "@/components/shared/PageFadeIn";

export default function ResearchPage() {
  return (
    <PageFadeIn>
      <ResearchView />
    </PageFadeIn>
  );
}
