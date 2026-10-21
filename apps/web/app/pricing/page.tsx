import type { Metadata } from "next";
import { Footer } from "@/components/home/sections/Footer";
import { Navbar } from "@/components/home/Navbar";
import { landingFont } from "@/components/home/fonts";
import { PricingSection } from "@/components/home/sections/PricingSection";
import { pageMetadata } from "@/lib/metadata";

const description =
  "Explore UseFrame credit packs and start building your first research-backed website for free.";

export const metadata: Metadata = pageMetadata("Pricing", description, {
  path: "/pricing",
  indexable: true,
});

export default function PricingPage() {
  return (
    <div
      className={`${landingFont.className} min-h-screen overflow-x-clip bg-white`}
    >
      <Navbar serifClassName={landingFont.className} />
      <main className="pt-16 sm:pt-20">
        <PricingSection />
      </main>
      <Footer />
    </div>
  );
}
