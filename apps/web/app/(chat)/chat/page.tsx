import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata(
  "AI Conversations",
  "Continue your conversations with useframe and explore ideas for your next website.",
);

import ChatView from "@/components/chat/ChatView";
import { PageFadeIn } from "@/components/shared/PageFadeIn";

export default function ChatsPage() {
  return (
    <PageFadeIn>
      <ChatView />
    </PageFadeIn>
  );
}
