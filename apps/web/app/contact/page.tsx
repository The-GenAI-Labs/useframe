import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { LEGAL_PAGES, legalMetadata } from "@/lib/legal";

export const metadata: Metadata = legalMetadata(LEGAL_PAGES.contact);

export default function ContactPage() {
  return <LegalPage slug="contact" />;
}
