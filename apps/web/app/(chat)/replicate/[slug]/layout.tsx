import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata(
  "Website Recreation Workspace",
  "Review and refine the website you are recreating in useframe.",
);

export default function PageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
