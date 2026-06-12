"use client";

import { memo } from "react";
import { Instrument_Serif } from "next/font/google";
import { Navbar } from "./Navbar";
import { Hero } from "./Hero";
import { FloatingCards } from "./FloatingCards";
import { ShowcaseGrid } from "./ShowcaseGrid";
import { WorkspacePreview } from "./WorkspacePreview";
import { QuickActions } from "./QuickActions";
import { BackgroundClouds } from "./BackgroundClouds";

const serif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  fallback: ["Georgia", "serif"],
});

export const HomeView = memo(function HomeView() {
  return (
    <div className="relative min-h-screen w-full overflow-x-clip bg-sky-100">
      <BackgroundClouds />
      <FloatingCards />
      <Navbar serifClassName={serif.className} />

      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center px-4 pb-16 sm:px-6">
        <div className="flex min-h-[calc(100vh-72px)] w-full flex-col items-center pt-8 sm:pt-12">
          <Hero serifClassName={serif.className} />
          <WorkspacePreview />
          <QuickActions />
        </div>
        <ShowcaseGrid />
      </main>
    </div>
  );
});
