"use client";

import { useAuth } from "@/lib/authContext";
import { HomeView } from "@/components/home/HomeView";
import ChatHomeView from "@/components/chat/ChatHomeView";
import { PageFadeIn } from "@/components/shared/PageFadeIn";

export default function RootPage() {
  const { status } = useAuth();

  if (status === "loading") {
    return null;
  }

  if (status === "unauthenticated") {
    return <HomeView />;
  }

  return (
    <PageFadeIn>
      <ChatHomeView />
    </PageFadeIn>
  );
}
