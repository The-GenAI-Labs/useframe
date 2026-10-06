import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata(
  "Your Projects",
  "Manage the websites you are building, improving, and publishing with useframe.",
);

export default function PageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
