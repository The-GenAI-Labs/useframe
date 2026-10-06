import type { Metadata } from "next";

export const SITE_URL = "https://useframe.in";
export const SITE_NAME = "useframe";
export const SITE_TITLE = "AI Website Builder with Research-Backed Design";
export const SITE_DESCRIPTION =
  "Turn your idea into a business website with useframe. Build with AI, refine your design with research, check your SEO, and publish from one workspace.";

export const isIndexableDeployment =
  process.env.NODE_ENV === "production" &&
  (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "production") &&
  (process.env.SITE_INDEXING_ENABLED === undefined ||
    process.env.SITE_INDEXING_ENABLED === "true");

const shareImage = {
  url: "/og-image.png",
  width: 1731,
  height: 909,
  alt: "useframe — AI website builder with research-backed design",
};

export function pageMetadata(
  title: string,
  description: string,
  { path, indexable = false }: { path?: string; indexable?: boolean } = {},
): Metadata {
  const canIndex = indexable && isIndexableDeployment;
  const shareTitle = `${title} | ${SITE_NAME}`;

  return {
    title: { absolute: shareTitle },
    description,
    ...(path ? { alternates: { canonical: path } } : {}),
    robots: {
      index: canIndex,
      follow: canIndex,
      ...(canIndex ? { googleBot: { "max-image-preview": "large" } } : {}),
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: SITE_NAME,
      title: shareTitle,
      description,
      ...(path ? { url: path } : {}),
      images: [shareImage],
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description,
      images: [shareImage],
    },
  };
}
