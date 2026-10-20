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
        tag="Website assessment"
        title="Website Scoring"
        description="Review design, usability, SEO, and performance with actionable recommendations for your website."
      />
    ),
    images: ["/auth/login13.png", "/auth/login16.png", "/auth/login17.png"],
    imageTitle: "Website assessment preview",
  },
  {
    leftContent: (
      <SlideCard
        tag="Competitor insights"
        title="Competitor Analysis"
        description="Explore competitor websites to understand their structure, messaging, and design choices."
      />
    ),
    images: ["/auth/login18.png", "/auth/login20.png", "/auth/login12.png"],
    imageTitle: "Competitor Breakdown",
  },
  {
    leftContent: (
      <SlideCard
        tag="Design research"
        title="Deep Research"
        description="Connect design recommendations to relevant research and understand the thinking behind your website."
      />
    ),
    images: ["/auth/landing1.png", "/auth/landing2.png", "/auth/login14.png"],
    imageTitle: "Research Summaries",
  },
];
