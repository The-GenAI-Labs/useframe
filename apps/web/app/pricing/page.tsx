import type { Metadata } from "next";
import { Footer } from "@/components/home/sections/Footer";
import { Navbar } from "@/components/home/Navbar";
import { landingFont } from "@/components/home/fonts";
import { PricingSection } from "@/components/home/sections/PricingSection";
import { pageMetadata, SITE_NAME, SITE_URL } from "@/lib/metadata";

const title = "AI Website Builder Pricing & Credit Packs";
const description =
  "Compare UseFrame credit packs for AI website creation, research, SEO analysis, and secure Cloudflare deployment. Start with your first website free.";

export const metadata: Metadata = {
  ...pageMetadata(title, description, {
    path: "/pricing",
    indexable: true,
  }),
  keywords: [
    "AI website builder pricing",
    "website builder credit packs",
    "research-backed website design",
    "SEO website analysis",
    "Cloudflare website deployment",
  ],
  category: "technology",
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${SITE_URL}/pricing#webpage`,
      url: `${SITE_URL}/pricing`,
      name: `${title} | ${SITE_NAME}`,
      description,
      isPartOf: {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
      },
      mainEntity: {
        "@type": "ItemList",
        name: "UseFrame pricing capabilities",
        itemListElement: [
          "AI website creation",
          "Research and competitor analysis",
          "SEO and website scoring",
          "Cloudflare deployment",
        ].map((name, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name,
        })),
      },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${SITE_URL}/`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Pricing",
          item: `${SITE_URL}/pricing`,
        },
      ],
    },
  ],
};

export default function PricingPage() {
  return (
    <div
      className={`${landingFont.className} min-h-screen overflow-x-clip bg-white`}
    >
      <Navbar serifClassName={landingFont.className} />
      <main className="pt-16 sm:pt-20">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
        <PricingSection />
      </main>
      <Footer />
    </div>
  );
}
