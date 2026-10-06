import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata(
  "Website Workspace",
  "Research, build, refine, and publish your website from your useframe workspace.",
);

export default function PageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
