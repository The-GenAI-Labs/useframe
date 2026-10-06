import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = {
  ...pageMetadata(
    "Completing Sign-In",
    "Securely completing your sign-in to useframe.",
  ),
  referrer: "no-referrer",
};

export default function PageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
