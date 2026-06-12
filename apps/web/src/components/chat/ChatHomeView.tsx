"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import GridBackground from "@/components/chat/GridBackground";
import WelcomeCards from "@/components/chat/WelcomeCards";
import ChatInput from "@/components/chat/ChatInput";

export default function ChatHomeView() {
  const router = useRouter();

  const handleSubmit = useCallback((message: string) => {
    console.log("message:", message);
  }, []);

  const handleCardClick = useCallback((id: string) => {
    console.log("card:", id);
  }, []);

  return (
    <div className="relative flex h-full w-full overflow-hidden" style={{ backgroundColor: "var(--bg-shell) !important" }}>
      <GridBackground />

      <div className="relative z-10 flex flex-col items-center justify-center w-full h-full px-8 py-12">
        <div className="flex flex-col gap-6 w-1/2 min-w-[420px]">

          <div>
            <h1 className="text-4xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
              Hi, there!
            </h1>
            <p className="text-xl mt-1 font-normal" style={{ color: "var(--text-secondary)" }}>
              How can I assist you today?
            </p>
          </div>

          <WelcomeCards onCardClick={handleCardClick} />

          <ChatInput onSubmit={handleSubmit} />
        </div>
      </div>
    </div>
  );
}
