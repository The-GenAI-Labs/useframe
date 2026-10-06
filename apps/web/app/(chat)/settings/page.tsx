import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata(
  "Account Settings",
  "Manage your account and workspace preferences in useframe.",
);

import SettingsView from "@/components/settings/SettingsView";
import { PageFadeIn } from "@/components/shared/PageFadeIn";

export default function SettingsPage() {
  return (
    <PageFadeIn>
      <SettingsView />
    </PageFadeIn>
  );
}
