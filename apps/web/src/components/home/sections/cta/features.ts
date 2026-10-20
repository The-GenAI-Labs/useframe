import { Globe, Search, BarChart3, Rocket } from "lucide-react";

export const FEATURES = [
  {
    id: "landing",
    number: "01",
    label: "Landing Pages",
    icon: Globe,
    tag: "Conversion Design",
    headline: "A clear first impression.",
    description:
      "Turn a short brief into a landing page with a clear structure, focused copy, and purposeful calls to action. Refine the result through chat.",
    accentRgb: "37,99,235",
    image: "/chat/useframecloud.jpg",
  },
  {
    id: "seo",
    number: "02",
    label: "SEO",
    icon: Search,
    tag: "Search Intelligence",
    headline: "Build a stronger search foundation.",
    description:
      "Review your website SEO and identify improvements to content, metadata, and page structure before you publish.",
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
      "Publish on a UseFrame subdomain. Custom domain support is subject to availability and requires domain verification.",
    accentRgb: "124,58,237",
    image: "/chat/useframecloud.jpg",
  },
  {
    id: "deployment",
    number: "04",
    label: "Deployment",
    icon: Rocket,
    tag: "Website publishing",
    headline: "Publish with confidence.",
    description:
      "Preview your website, review your changes, and publish when you are ready. Keep previous versions available as your site evolves.",
    accentRgb: "225,29,72",
    image: "/chat/useframecloud.jpg",
  },
  {
    id: "score",
    number: "05",
    label: "Web Score",
    icon: BarChart3,
    tag: "Research-based",
    headline: "Understand what to improve.",
    description:
      "Assess design, accessibility, content, SEO, and performance. Use clear recommendations to prioritise your next improvements.",
    accentRgb: "245,158,11",
    image: "/chat/useframecloud.jpg",
  },
] as const;
