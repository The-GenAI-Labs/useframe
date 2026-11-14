import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import ResearchLibraryView from "@/components/research/ResearchLibraryView";
import { PageFadeIn } from "@/components/shared/PageFadeIn";

export const metadata: Metadata = pageMetadata(
  "Research Library",
  "Structured design research findings with their sources.",
);

export default function ResearchLibraryPage() {
  return (
    <PageFadeIn>
      <ResearchLibraryView />
    </PageFadeIn>
  );
}
