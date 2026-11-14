import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import FindingDetailView from "@/components/research/FindingDetailView";
import { PageFadeIn } from "@/components/shared/PageFadeIn";

export const metadata: Metadata = pageMetadata(
  "Research Finding",
  "A design research finding, its options and its source.",
);

export default async function ResearchFindingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <PageFadeIn>
      <FindingDetailView slug={slug} />
    </PageFadeIn>
  );
}
