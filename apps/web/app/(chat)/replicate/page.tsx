import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata(
  "Recreate a Website",
  "Use a website reference to create and refine your own design in useframe.",
);

import ReplicateView from "@/components/replicate/ReplicateView";
import { PageFadeIn } from "@/components/shared/PageFadeIn";

export default function ReplicatePage() {
  return (
    <PageFadeIn>
      <ReplicateView />
    </PageFadeIn>
  );
}
