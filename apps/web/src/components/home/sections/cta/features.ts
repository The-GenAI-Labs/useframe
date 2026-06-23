import { Globe, Search, BarChart3, Rocket } from "lucide-react";

export const FEATURES = [
  {
    id: "landing",
    number: "01",
    label: "Landing Pages",
    icon: Globe,
    tag: "Conversion Design",
    headline: "Pages that convert, instantly.",
    description:
      "Generate pixel-perfect landing pages from a single brief. A/B variants, hero copy, and CTA hierarchy — all informed by live competitor benchmarks.",
    accentRgb: "37,99,235",
    image: "/chat/useframecloud.jpg",
  },
  {
    id: "seo",
    number: "02",
    label: "SEO",
    icon: Search,
    tag: "Search Intelligence",
    headline: "Rank before you launch.",
    description:
      "AI-driven keyword clustering, meta generation, and content briefs. UseFrame maps your site structure to search intent before a single line goes live.",
    accentRgb: "5,150,105",
    image: "/chat/useframecloud.jpg",
  },
  {
    id: "domain",
    number: "03",
    label: "Custom Domain",
    icon: Globe,
    tag: "Brand Infrastructure",
    headline: "Your brand, your address.",
    description:
      "Connect any domain in seconds. DNS propagation, SSL provisioning, and redirect logic handled automatically — no DevOps required.",
    accentRgb: "124,58,237",
    image: "/chat/useframecloud.jpg",
  },
  {
    id: "deployment",
    number: "04",
    label: "Deployment",
    icon: Rocket,
    tag: "Zero-config Deploy",
    headline: "Live in minutes, not days.",
    description:
      "One-click deployment to a global edge network. Preview environments, rollback, and CI hooks — production-grade from day one.",
    accentRgb: "225,29,72",
    image: "/chat/useframecloud.jpg",
  },
  {
    id: "score",
    number: "05",
    label: "Web Score",
    icon: BarChart3,
    tag: "Research-based",
    headline: "Know your score before they do.",
    description:
      "Research-backed performance, accessibility, and UX scoring. Get a prioritised fix list with estimated conversion impact for every issue found.",
    accentRgb: "245,158,11",
    image: "/chat/useframecloud.jpg",
  },
] as const;
