"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import GridBackground from "@/components/chat/GridBackground";
import WelcomeCards from "@/components/chat/WelcomeCards";
import ChatInput from "@/components/chat/ChatInput";

export default function ChatHomePage() {
  const router = useRouter();

  const handleSubmit = useCallback((message: string) => {
    console.log("message:", message);
  }, []);

  const handleCardClick = useCallback((id: string) => {
    console.log("card:", id);
  }, []);

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      <GridBackground />

      <div className="relative z-10 flex flex-col items-center justify-center w-full h-full px-8 py-12">
        <div className="flex flex-col gap-6 w-1/2 min-w-[420px]">

          <div>
            <h1 className="text-4xl font-semibold text-black/85 tracking-tight">
              Hi, there!
            </h1>
            <p className="text-xl text-black/35 mt-1 font-normal">
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