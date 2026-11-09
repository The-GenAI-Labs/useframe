import type { Metadata } from "next";
import { pageMetadata, SITE_NAME, SITE_URL } from "./metadata";

export const LEGAL = {
  brandName: "UseFrame",
  siteUrl: SITE_URL,
  // Must match the account holder name on the Razorpay account.
  operatorName: "Rishabh Chaudhary",
  supportEmail: "hi@useframe.in",
  supportPhoneDisplay: "+91 70169 38629",
  supportPhoneTel: "+917016938629",
  responseTime: "2 business days",
  grievanceOfficerName: "Rishabh Chaudhary",
  registeredAddress: null as string | null,
  lastUpdated: "9 November 2026",
  // Must equal TERMS_VERSION in apps/server/src/modules/auth/auth.service.ts.
  lastUpdatedISO: "2026-11-09",
} as const;

export type LegalSlug =
  | "privacy"
  | "terms"
  | "refund-policy"
  | "delivery-policy"
  | "contact";

export type LegalPageInfo = {
  slug: LegalSlug;
  path: `/${LegalSlug}`;
  label: string;
  title: string;
  description: string;
};

export const LEGAL_PAGES: Record<LegalSlug, LegalPageInfo> = {
  privacy: {
    slug: "privacy",
    path: "/privacy",
    label: "Privacy Policy",
    title: "Privacy Policy | UseFrame",
    description:
      "How UseFrame collects, uses and protects your data, including AI processing, payments and your rights under Indian law.",
  },
  terms: {
    slug: "terms",
    path: "/terms",
    label: "Terms & Conditions",
    title: "Terms & Conditions | UseFrame",
    description:
      "The terms for using UseFrame: accounts, credits, your content, acceptable use and hosting of the sites you publish.",
  },
  "refund-policy": {
    slug: "refund-policy",
    path: "/refund-policy",
    label: "Refund Policy",
    title: "Refund & Cancellation Policy | UseFrame",
    description:
      "UseFrame credit purchases are one-time and final. Read when we can fix a billing error and how to ask.",
  },
  "delivery-policy": {
    slug: "delivery-policy",
    path: "/delivery-policy",
    label: "Delivery Policy",
    title: "Delivery Policy | UseFrame",
    description:
      "UseFrame is a digital service. Credits are added to your account instantly after payment is confirmed.",
  },
  contact: {
    slug: "contact",
    path: "/contact",
    label: "Contact",
    title: "Contact UseFrame",
    description:
      "Email or call UseFrame for support, billing questions or privacy requests. We reply within 2 business days.",
  },
};

export const LEGAL_PAGE_LIST = Object.values(LEGAL_PAGES);

export function legalMetadata(page: LegalPageInfo): Metadata {
  return pageMetadata(page.label, page.description, {
    path: page.path,
    indexable: true,
    fullTitle: page.title,
  });
}

export function legalStructuredData(page: LegalPageInfo) {
  const url = `${SITE_URL}${page.path}`;
  const webPage = {
    "@context": "https://schema.org",
    "@id": `${url}#webpage`,
    url,
    name: page.title,
    description: page.description,
    inLanguage: "en",
    dateModified: LEGAL.lastUpdatedISO,
    isPartOf: {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
    },
  };

  if (page.slug !== "contact") return { ...webPage, "@type": "WebPage" };

  return {
    ...webPage,
    "@type": "ContactPage",
    mainEntity: {
      "@type": "Organization",
      name: LEGAL.brandName,
      url: SITE_URL,
      email: LEGAL.supportEmail,
      contactPoint: {
        "@type": "ContactPoint",
        email: LEGAL.supportEmail,
        telephone: LEGAL.supportPhoneTel,
        contactType: "customer support",
        areaServed: "IN",
        availableLanguage: "en",
      },
    },
  };
}
