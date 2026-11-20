import type { ResolvedMediaAsset, Section, SiteSpec } from "@repo/schemas";

export type Fixture = { name: string; spec: SiteSpec; assets: ResolvedMediaAsset[] };

type Content = NonNullable<Section["content"]>;

const sec = (type: Section["type"], index: number, content: Content, variant?: Section["variant"]): Section => ({
  type,
  index,
  content,
  ...(variant ? { variant } : {}),
});

const items = (...pairs: [string, string, string?][]) => pairs.map(([title, description, icon]) => ({ title, description, ...(icon ? { icon } : {}) }));

function photo(id: string, base: string, width: number, height: number, alt: string): ResolvedMediaAsset {
  const url = `${base}/${id}.png`;
  const variant = (role: "w480" | "w960" | "w1600" | "fallback", w: number, mime = "image/webp") => ({
    role,
    mime,
    width: w,
    height: Math.round((w * height) / width),
    bytes: 90_000,
    sha256: id.padEnd(64, "0").slice(0, 64),
    url,
  });
  return {
    id,
    kind: "IMAGE",
    origin: "UPLOADED",
    status: "READY",
    deleted: false,
    title: alt,
    width,
    height,
    durationMs: null,
    dominantColor: null,
    lqip: null,
    altText: alt,
    decorative: false,
    variants: [variant("w480", 480), variant("w960", 960), variant("w1600", 1600), variant("fallback", 1600, "image/png")],
  };
}

const designSystem = (
  primaryColor: string,
  secondaryColor: string,
  accentColor: string,
  fontPrimary: string,
  fontSecondary: string,
): SiteSpec["designSystem"] => ({
  primaryColor,
  secondaryColor,
  accentColor,
  fontPrimary,
  fontSecondary,
  spacing: "comfortable",
  borderRadius: "md",
  animationStyle: "subtle",
});

const base = { copyFramework: "AIDA" as const, citations: [] };

export const PHOTO_SPECS: { id: string; width: number; height: number; hues: [number, number] }[] = [
  { id: "fit-hero", width: 1600, height: 900, hues: [8, 32] },
  { id: "fit-a", width: 1200, height: 900, hues: [350, 20] },
  { id: "fit-b", width: 1200, height: 900, hues: [25, 45] },
  { id: "lux-hero", width: 2400, height: 1350, hues: [28, 38] },
  { id: "lux-cta", width: 2400, height: 1000, hues: [20, 30] },
  { id: "lux-show", width: 1600, height: 900, hues: [32, 15] },
];

export function fixtures(assetBase = "https://assets.example.test/gallery"): Fixture[] {
  const saas: SiteSpec = {
    ...base,
    siteType: "SINGLE_PAGE",
    designSystem: designSystem("#6366F1", "#A78BFA", "#22D3EE", "Space Grotesk", "Inter"),
    theme: { preset: "tech", colorMode: "dark" },
    pages: [
      {
        type: "HOME",
        slug: "home",
        title: "Northwind",
        seo: { title: "Northwind — Operations control for modern teams", description: "Plan, automate and ship operations work." },
        sections: [
          sec("HERO", 0, {
            eyebrow: "New: workflow automations",
            headline: "Run your operations from one calm control plane",
            subheadline: "Northwind connects tickets, approvals and on-call so teams resolve work in minutes, not days.",
            cta: { primary: "Start free trial", primaryHref: "https://northwind.example.com/signup", secondary: "Book a demo" },
          }),
          sec("LOGOS", 1, { logos: [{ name: "Acme" }, { name: "Globex" }, { name: "Initech" }, { name: "Umbrella" }, { name: "Hooli" }] }),
          sec(
            "FEATURES",
            2,
            {
              eyebrow: "Platform",
              headline: "Everything your ops team needs",
              subheadline: "Replace five tools with one workspace built for speed and accountability.",
              items: items(
                ["Automated routing", "Rules send every request to the right owner the moment it arrives.", "zap"],
                ["Audit-ready history", "Every change is versioned and searchable for compliance reviews.", "shield-check"],
                ["Live dashboards", "See backlog, SLAs and load in real time.", "chart"],
                ["Integrations", "Connect Slack, Jira and 40+ tools in a click.", "link"],
                ["Role-based access", "Granular permissions for every team and region.", "lock"],
              ),
            },
            "bento",
          ),
          sec("STATS", 3, { stats: [{ value: "38%", label: "Faster resolution" }, { value: "2.4k", label: "Teams onboarded" }, { value: "99.95%", label: "Uptime last year" }] }, "cards"),
          sec("HOW_IT_WORKS", 4, {
            headline: "Live in an afternoon",
            items: items(["Connect your tools", "Import queues and users from the tools you already use."], ["Set your rules", "Describe routing and SLAs in plain language."], ["Watch it run", "Northwind assigns, escalates and reports automatically."]),
          }),
          sec("TESTIMONIALS", 5, {
            headline: "Teams that switched",
            items: [
              { title: "Priya Raman, Head of Operations, Globex", description: "“We closed our backlog in two weeks and never looked back.”" },
              { title: "Marcus Lee", author: "Marcus Lee", role: "VP Support", company: "Initech", description: "Escalations used to live in DMs. Now they live in one place, with an owner." },
              { title: "Ana Torres, Platform Lead", description: "The audit trail alone saved us a full week during our SOC 2 review." },
            ],
          }),
          sec("PRICING", 6, {
            headline: "Simple, per-seat pricing",
            subheadline: "Start free. Upgrade when your team grows.",
            plans: [
              { name: "Starter", price: "$0", period: "/month", description: "For small teams getting organised.", features: ["Up to 5 seats", "Core automations", "Community support"], cta: "Start free" },
              { name: "Growth", price: "$24", period: "/seat/month", description: "For scaling operations teams.", features: ["Unlimited automations", "SLA policies", "Priority support", "SSO"], cta: "Start trial", highlighted: true },
              { name: "Enterprise", price: "Custom", description: "For regulated and global teams.", features: ["Audit exports", "Data residency", "Dedicated success manager"], cta: "Talk to sales" },
            ],
          }),
          sec("FAQ", 7, {
            headline: "Questions, answered",
            items: items(
              ["Can I import from our current tool?", "Yes. Northwind imports queues, users and history from the most common ticketing tools."],
              ["Is there a free plan?", "The Starter plan is free for up to five seats, forever."],
              ["How is data secured?", "Data is encrypted in transit and at rest, with role-based access controls."],
            ),
          }),
          sec("CTA", 8, { headline: "Bring calm to your operations", body: "Try Northwind free for 14 days. No credit card needed.", cta: { primary: "Start free trial", primaryHref: "https://northwind.example.com/signup" } }),
          sec("FOOTER", 9, { subheadline: "Operations control for modern teams.", links: [{ label: "Privacy", href: "https://northwind.example.com/privacy" }, { label: "Terms", href: "https://northwind.example.com/terms" }] }),
        ],
      },
    ],
  };

  const fitness: SiteSpec = {
    ...base,
    siteType: "SINGLE_PAGE",
    designSystem: designSystem("#E11D48", "#FDA4AF", "#F59E0B", "Outfit", "Inter"),
    theme: { preset: "bold" },
    media: {
      "home/hero-0/visual": { assetId: "fit-hero" },
      "home/features-1/item-0": { assetId: "fit-a" },
      "home/features-1/item-1": { assetId: "fit-b" },
    },
    pages: [
      {
        type: "HOME",
        slug: "home",
        title: "Pulse",
        seo: { title: "Pulse | Training that adapts to you", description: "Personal training plans that adapt every week." },
        sections: [
          sec("HERO", 0, {
            eyebrow: "Personal training, rebuilt",
            headline: "Get stronger with a plan that adapts every week",
            subheadline: "Pulse builds your workouts around your schedule, equipment and progress.",
            cta: { primary: "Start your free week", secondary: "See how it works" },
          }),
          sec(
            "FEATURES",
            1,
            {
              eyebrow: "Why Pulse",
              headline: "Coaching in your pocket",
              items: items(
                ["Workouts that adapt", "Every session adjusts to how your last one went.", "dumbbell"],
                ["Form feedback", "Short video cues keep every rep safe and effective.", "camera"],
                ["Fits your week", "Plans flex around busy days, travel and rest.", "calendar"],
              ),
            },
            "alternating",
          ),
          sec("HOW_IT_WORKS", 2, {
            headline: "Three steps to your first workout",
            items: items(["Tell us your goal", "Strength, endurance or general fitness."], ["Get your plan", "A four-week programme built in seconds."], ["Train and track", "Log sets and watch your progress climb."]),
          }, "timeline"),
          sec("FAQ", 3, {
            headline: "Common questions",
            items: items(["Do I need a gym?", "No. Plans work with bodyweight, dumbbells or a full gym."], ["Can beginners use Pulse?", "Yes. Plans start where you are and progress gradually."]),
          }, "two-column"),
          sec("CTA", 4, { headline: "Your first week is on us", body: "Cancel anytime in two taps.", cta: { primary: "Start free week" } }, "split"),
          sec("FOOTER", 5, { headline: "© 2025 Pulse Fitness. All rights reserved." }, "minimal"),
        ],
      },
    ],
  };

  const kids: SiteSpec = {
    ...base,
    siteType: "SINGLE_PAGE",
    designSystem: designSystem("#7C3AED", "#34D399", "#FBBF24", "Fredoka", "Nunito"),
    theme: { preset: "soft" },
    pages: [
      {
        type: "HOME",
        slug: "home",
        title: "Sprout",
        seo: { title: "Sprout — Playful reading practice for ages 5–9", description: "Stories that grow with your child." },
        sections: [
          sec("HERO", 0, {
            eyebrow: "Ages 5–9",
            headline: "Reading practice your kids will ask for",
            subheadline: "Short, playful stories that adjust to each child's level, with progress you can see.",
            cta: { primary: "Try Sprout free" },
          }, "split"),
          sec("FEATURES", 1, {
            headline: "Made for little learners",
            subheadline: "Designed with teachers and tested with real families.",
            items: items(
              ["Stories at the right level", "Every story adapts to your child's reading level.", "book"],
              ["Read-along voice", "Tap any word to hear it spoken clearly.", "message"],
              ["Gentle rewards", "Stickers and streaks celebrate effort, not screen time.", "star"],
              ["Parent dashboard", "See words learned and time spent each week.", "chart"],
              ["Safe by design", "No ads, no chat, no in-app purchases.", "shield-check"],
              ["Works offline", "Download stories for car rides and flights.", "cloud"],
            ),
          }),
          sec("HOW_IT_WORKS", 2, {
            headline: "Start reading in minutes",
            items: items(["Create a profile", "Pick an avatar and a starting level."], ["Read a story", "Ten-minute adventures with read-along help."], ["Celebrate progress", "Earn stickers and share wins with family."], ["Level up", "Stories get a little harder as skills grow."]),
          }),
          sec("TEAM", 3, {
            headline: "The people behind Sprout",
            items: [
              { title: "Hannah Okafor", description: "Former primary teacher", role: "Learning design" },
              { title: "Leo Martins", description: "Children's book illustrator" },
              { title: "Mei Chen", description: "Speech and language specialist" },
            ],
          }),
          sec("CONTACT", 4, {
            headline: "Questions from parents and schools",
            body: "We reply within one school day.",
            items: items(["Email", "hello@sprout.example.com"], ["Phone", "+1 415 555 0134"]),
          }),
          sec("CTA", 5, { headline: "Give reading a head start", body: "Free for 30 days. No card needed.", cta: { primary: "Try Sprout free" } }),
        ],
      },
    ],
  };

  const seniors: SiteSpec = {
    ...base,
    siteType: "SINGLE_PAGE",
    designSystem: designSystem("#0F766E", "#99F6E4", "#EA580C", "Lexend", "Source Sans 3"),
    theme: { preset: "minimal", density: "airy" },
    designBrief: {
      product: "CareCircle",
      audience: { primary: "Adults over 70 and their families" },
      goal: "Book a free care consultation",
      brand: { personality: "Warm, steady, respectful", positioning: "Home care you can trust", tone: "Plain and reassuring" },
      colors: { primary: "#0F766E", secondary: "#99F6E4", accent: "#EA580C", rationale: "Calm teal", citation: "" },
      typography: { primary: "Lexend", secondary: "Source Sans 3", minSize: "19px", rationale: "Readability", citation: "" },
      layout: { sections: ["HERO", "FEATURES", "TESTIMONIALS", "FAQ", "CONTACT"], rationale: "Simple", citation: "" },
      copyFramework: "AIDA",
      frameworkRationale: "",
      density: "airy",
      motion: "minimal",
      accessibility: { minContrast: "7:1", touchTarget: "48px" },
      avoid: [],
      citations: [],
    },
    pages: [
      {
        type: "HOME",
        slug: "home",
        title: "CareCircle",
        sections: [
          sec("HERO", 0, {
            headline: "Trusted care at home, arranged in one call",
            subheadline: "Friendly, vetted carers for daily help, companionship and medication reminders.",
            cta: { primary: "Book a free consultation", primaryHref: "tel:+14155550199", secondary: "How it works" },
            stats: [{ value: "4.9/5", label: "Family rating" }, { value: "24/7", label: "Phone support" }],
          }),
          sec("FEATURES", 1, {
            headline: "Help that fits your day",
            items: items(
              ["Daily living support", "Help with meals, bathing, dressing and light housework.", "home"],
              ["Companionship", "Conversation, walks and outings with a familiar face.", "heart"],
              ["Medication reminders", "Gentle reminders at the right time, every day.", "clock"],
            ),
          }, "list"),
          sec("TESTIMONIALS", 2, {
            headline: "What families say",
            items: [{ title: "Margaret Ellis, daughter of a CareCircle client", description: "“Mum looks forward to every visit. I finally sleep through the night.”" }],
          }, "featured"),
          sec("FAQ", 3, {
            headline: "Questions families ask",
            items: items(
              ["How quickly can care start?", "Usually within three days of your consultation."],
              ["Are carers background checked?", "Yes. Every carer is vetted, trained and insured."],
              ["Can we change the schedule?", "Yes. Call us any time and we'll adjust visits."],
            ),
          }),
          sec("CONTACT", 4, {
            headline: "Talk to a care advisor",
            body: "Call or email and a real person will help you plan the next step.",
            items: items(["Call us", "+1 415 555 0199"], ["Email", "care@carecircle.example.com"], ["Visit", "120 Elm Street, Springfield"]),
          }),
          sec("FOOTER", 5, {}),
        ],
      },
    ],
  };

  const luxury: SiteSpec = {
    ...base,
    siteType: "SINGLE_PAGE",
    designSystem: designSystem("#1C1917", "#D6D3D1", "#B45309", "Cormorant Garamond", "Jost"),
    theme: { preset: "editorial" },
    media: {
      "home/hero-0/background": { assetId: "lux-hero" },
      "home/cta-4/background": { assetId: "lux-cta" },
      "home/custom-2/showcase": { assetId: "lux-show" },
    },
    pages: [
      {
        type: "HOME",
        slug: "home",
        title: "Maison Ardent",
        seo: { title: "Maison Ardent — Leather goods made by hand in Florence", description: "Hand-stitched leather goods." },
        sections: [
          sec("HERO", 0, {
            eyebrow: "Atelier collection",
            headline: "Leather goods made slowly, by hand",
            subheadline: "Each piece is cut, stitched and finished by a single artisan in our Florence atelier.",
            cta: { primary: "Explore the collection", secondary: "Visit the atelier" },
          }),
          sec("FEATURES", 1, {
            eyebrow: "The craft",
            headline: "Details you can feel",
            subheadline: "Three generations of technique in every seam.",
            items: items(
              ["Full-grain leather", "Sourced from a single tannery in Tuscany.", "leaf"],
              ["Saddle stitching", "Two needles, one thread, stronger than any machine.", "award"],
              ["Lifetime repairs", "Return any piece to the atelier for care, always.", "heart"],
            ),
          }),
          sec("CUSTOM", 2, {
            headline: "Inside the atelier",
            body: "Our workshop sits on a quiet street behind the Arno.\n\nVisits are by appointment, so every guest has an artisan's full attention.",
          }),
          sec("TESTIMONIALS", 3, {
            headline: "From our clients",
            items: [
              { title: "Élise Martin, Paris", description: "“Ten years on, my bag looks better than the day I bought it.”" },
              { title: "James Whitaker, London", description: "“The repair service is as personal as the original commission.”" },
            ],
          }),
          sec("CTA", 4, { headline: "Commission a piece", body: "Private appointments in Florence and by video.", cta: { primary: "Request an appointment", primaryHref: "mailto:atelier@ardent.example.com" } }),
          sec("FOOTER", 5, { subheadline: "Hand-made in Florence since 1962." }),
        ],
      },
    ],
  };

  const fintech: SiteSpec = {
    ...base,
    siteType: "MULTI_PAGE",
    designSystem: designSystem("#1D4ED8", "#FDE68A", "#10B981", "Plus Jakarta Sans", "Inter"),
    theme: { preset: "warm" },
    pages: [
      {
        type: "HOME",
        slug: "home",
        title: "Home",
        seo: { title: "Ledgerly — Banking for freelancers", description: "Invoices, taxes and savings in one account." },
        sections: [
          sec("HEADER", 0, { headline: "Ledgerly", cta: { primary: "Open an account", primaryHref: "/pricing" } }, "bar"),
          sec("HERO", 1, {
            eyebrow: "Built for freelancers",
            headline: "Get paid, set aside tax and save — automatically",
            subheadline: "Ledgerly is the business account that sorts every payment the moment it lands.",
            cta: { primary: "Open an account", primaryHref: "/pricing", secondary: "See features" },
          }, "editorial"),
          sec("FEATURES", 2, {
            headline: "Money admin, handled",
            items: items(
              ["Smart invoices", "Send invoices that chase themselves.", "file-text"],
              ["Tax pots", "A share of every payment is saved for tax automatically.", "wallet"],
              ["Instant insights", "Know your profit and runway at a glance.", "trending-up"],
            ),
          }, "grid"),
          sec("STATS", 3, { headline: "Freelancers trust Ledgerly", stats: [{ value: "£1.2bn", label: "Invoiced through Ledgerly" }, { value: "4 min", label: "Average sign-up time" }, { value: "4.8★", label: "App Store rating" }] }),
          sec("CTA", 4, { headline: "Open your account in minutes", cta: { primary: "See pricing", primaryHref: "/pricing" } }),
          sec("FOOTER", 5, { subheadline: "Banking for the self-employed.", links: [{ label: "Privacy", href: "/privacy" }, { label: "Terms", href: "/terms" }] }, "columns"),
        ],
      },
      {
        type: "PRICING",
        slug: "pricing",
        title: "Pricing",
        sections: [
          sec("PRICING", 0, {
            headline: "Plans that grow with you",
            items: [
              { title: "Solo — £0/month", description: "Business account · Invoicing · Tax pots" },
              { title: "Pro — £9/month", description: "Everything in Solo · Receipt capture · Accountant access · Priority support" },
            ],
            cta: { primary: "Open an account", primaryHref: "https://ledgerly.example.com/signup" },
          }, "simple"),
          sec("FAQ", 1, { headline: "Pricing questions", items: items(["Can I switch plans?", "Yes, upgrade or downgrade at any time."], ["Are there hidden fees?", "No. You only pay the monthly plan price."]) }),
        ],
      },
    ],
  };

  const fitPhotos = PHOTO_SPECS.slice(0, 3).map((p) => photo(p.id, assetBase, p.width, p.height, "Athlete training"));
  const luxPhotos = PHOTO_SPECS.slice(3).map((p) => photo(p.id, assetBase, p.width, p.height, "Artisan stitching leather"));
  return [
    { name: "b2b-saas", spec: saas, assets: [] },
    { name: "fitness-app", spec: fitness, assets: fitPhotos },
    { name: "kids-edtech", spec: kids, assets: [] },
    { name: "seniors-healthcare", spec: seniors, assets: [] },
    { name: "luxury-brand", spec: luxury, assets: luxPhotos },
    { name: "fintech", spec: fintech, assets: [] },
  ];
}
