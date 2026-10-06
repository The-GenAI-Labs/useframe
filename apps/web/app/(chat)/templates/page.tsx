import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata(
  "Website Templates",
  "Explore website starting points and find a direction for your next project in useframe.",
);

import TemplatesView from "@/components/templates/TemplatesView";
import { PageFadeIn } from "@/components/shared/PageFadeIn";

export default function TemplatesPage() {
  return (
    <PageFadeIn>
      <TemplatesView />
    </PageFadeIn>
  );
}
