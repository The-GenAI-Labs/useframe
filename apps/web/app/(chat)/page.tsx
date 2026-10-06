import type { Metadata } from "next";
import { HomePage } from "@/components/home/HomePage";
import { pageMetadata, SITE_DESCRIPTION, SITE_TITLE } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata(SITE_TITLE, SITE_DESCRIPTION, {
  path: "/",
  indexable: true,
});

export default function RootPage() {
  return <HomePage />;
}
