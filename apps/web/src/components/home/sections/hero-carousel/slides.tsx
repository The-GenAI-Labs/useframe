"use client";

import { SlideCard } from "./SlideCard";

export type SlideContent = {
  leftContent: React.ReactNode;
  images: string[];
  imageTitle: string;
};

export const SLIDES: SlideContent[] = [
  {
    leftContent: (
      <SlideCard
        tag="Feature One"
        title="Website Scoring"
        description="Audit performance, UX and conversion signals with an AI web score. Get a prioritised fix list instantly."
      />
    ),
    images: ["/auth/login13.png", "/auth/login16.png", "/auth/login17.png"],
    imageTitle: "Live Scoring Dashboard",
  },
  {
    leftContent: (
      <SlideCard
        tag="Feature Two"
        title="Competitor Analysis"
        description="Benchmark any competitor's positioning, pricing and funnel in one click. Know the gaps before you build."
      />
    ),
    images: ["/auth/login18.png", "/auth/login20.png", "/auth/login12.png"],
    imageTitle: "Competitor Breakdown",
  },
  {
    leftContent: (
      <SlideCard
        tag="Feature Three"
        title="Deep Research"
        description="Long-form research summarised into action items you can ship from. 500+ sources, two pages."
      />
    ),
    images: ["/auth/landing1.png", "/auth/landing2.png", "/auth/login14.png"],
    imageTitle: "Research Summaries",
  },
];
