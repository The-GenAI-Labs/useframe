"use client";

import { memo, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, SendHorizontal } from "lucide-react";
import { usePendingPromptStore } from "@/stores/pendingPromptStore";
import { RobotSlider } from "./RobotSlider";

export const WorkspacePreview = memo(function WorkspacePreview() {
  const router = useRouter();
  const setPrompt = usePendingPromptStore((s) => s.setPrompt);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    if (e.target.value.trim()) setError(false);
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError(true);
      return;
    }
    setPrompt(trimmed);
    router.push("/signin");
  }, [value, setPrompt, router]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <motion.section
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.25, ease: "easeOut" }}
      aria-label="UseFrame AI workspace preview"
      className="relative z-10 -mt-40 w-full max-w-175"
    >
      {/* Bottom pinned to the box's top edge, then pushed back down 58px. The
          box itself moved up 200px (-mt-40 cancelling the 40px flow gap), so
          this offset leaves the robot a net ~150px higher than before —
          sinking it further onto the box instead of hovering above it. */}
      <RobotSlider className="absolute -left-4 bottom-full z-20 h-48 w-40 translate-y-[58px] sm:-left-6 sm:h-60 sm:w-50" />

      <div className="rounded-3xl bg-white/90 p-3 shadow-[0_24px_70px_-20px_rgba(30,100,200,0.35)] backdrop-blur-xl">
        <label htmlFor="home-ai-prompt" className="sr-only">
          Ask UseFrame AI
        </label>
        <input
          id="home-ai-prompt"
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Describe the site you want to build..."
          className="w-full bg-transparent px-2 pb-4 pt-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />

        <div className="flex items-center justify-between gap-3 px-1 pb-1">
          <input ref={fileInputRef} type="file" multiple className="hidden" />
          <button
            type="button"
            aria-label="Upload files"
            onClick={handleUploadClick}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-blue-200 bg-blue-50/60 text-blue-600 transition-colors hover:bg-blue-100"
          >
            <Plus className="size-4" />
          </button>

          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="text-xs font-medium text-blue-600"
              >
                Type something before sending
              </motion.p>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={handleSend}
            aria-label="Send"
            className="ml-auto flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_6px_20px_rgba(37,99,235,0.45)] transition-all hover:bg-blue-500"
          >
            <SendHorizontal className="size-4" />
          </button>
        </div>
      </div>
    </motion.section>
  );
});
