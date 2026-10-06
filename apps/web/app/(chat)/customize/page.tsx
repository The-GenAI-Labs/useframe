import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata(
  "Customize Your Workspace",
  "Set up your useframe workspace to suit the way you build websites.",
);

import SettingsView from "@/components/settings/SettingsView";
import { PageFadeIn } from "@/components/shared/PageFadeIn";

export default function CustomizePage() {
  return (
    <PageFadeIn>
      <SettingsView />
    </PageFadeIn>
  );
}
