import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata(
  "Research Finding",
  "Review a design research finding, its source, and the context behind a useframe recommendation.",
);

export default function PageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
