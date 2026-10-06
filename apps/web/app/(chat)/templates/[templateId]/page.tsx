import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata(
  "Page Not Found",
  "The page you requested is not available. Return to useframe to continue.",
);

import { notFound } from "next/navigation";

export default function Page() {
  notFound();
}
