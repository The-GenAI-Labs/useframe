"use client";

import { useAuth } from "@/lib/authContext";
import { HomeView } from "./HomeView";
import ChatHomeView, { ChatHomeSkeleton } from "@/components/chat/ChatHomeView";
import { AppShellSkeleton } from "@/components/layout/AppShellSkeleton";
import { PageFadeIn } from "@/components/shared/PageFadeIn";

export function HomePage() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <>
        <AppShellSkeleton className="session-shell">
          <ChatHomeSkeleton />
        </AppShellSkeleton>
        <div className="signed-out-view">
          <HomeView />
        </div>
      </>
    );
  }

  if (status !== "authenticated") return <HomeView />;

  return (
    <PageFadeIn>
      <ChatHomeView />
    </PageFadeIn>
  );
}
