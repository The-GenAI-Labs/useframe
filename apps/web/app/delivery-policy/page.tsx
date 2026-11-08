import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { LEGAL_PAGES, legalMetadata } from "@/lib/legal";

export const metadata: Metadata = legalMetadata(
  LEGAL_PAGES["delivery-policy"],
);

export default function DeliveryPolicyPage() {
  return <LegalPage slug="delivery-policy" />;
}
