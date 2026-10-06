"use client";

import { useAuth } from "@/lib/authContext";
import { HomeView } from "./HomeView";
import ChatHomeView from "@/components/chat/ChatHomeView";
import { PageFadeIn } from "@/components/shared/PageFadeIn";

export function HomePage() {
  const { status } = useAuth();

  if (status !== "authenticated") return <HomeView />;

  return (
    <PageFadeIn>
      <ChatHomeView />
    </PageFadeIn>
  );
}
