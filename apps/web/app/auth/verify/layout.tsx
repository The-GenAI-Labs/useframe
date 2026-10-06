import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = {
  ...pageMetadata(
    "Verify Your Sign-In",
    "Verify your sign-in link to securely access your useframe account.",
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
