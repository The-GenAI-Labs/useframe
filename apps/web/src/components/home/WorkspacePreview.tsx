"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown,
  Command,
  CornerDownLeft,
  Database,
  Mic,
  Plus,
  SendHorizontal,
  SlidersHorizontal,
} from "lucide-react";

export const WorkspacePreview = memo(function WorkspacePreview() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.25, ease: "easeOut" }}
      aria-label="UseFrame AI workspace preview"
      className="relative z-10 mt-10 w-full max-w-175 sm:mt-12"
    >
      <div className="rounded-3xl bg-white/90 p-3 shadow-[0_24px_70px_-20px_rgba(30,100,200,0.35)] backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Upload files"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-blue-200 text-blue-500 transition-colors hover:bg-blue-50"
          >
            <Plus className="size-4" />
          </button>
          <div className="h-9 min-w-0 flex-1 rounded-xl bg-slate-100" />
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Database className="size-4 text-slate-500" />
            Data
            <ChevronDown className="size-3.5 text-slate-400" />
          </button>
        </div>

        <label htmlFor="home-ai-prompt" className="sr-only">
          Ask UseFrame AI
        </label>
        <input
          id="home-ai-prompt"
          type="text"
          defaultValue="Combine those two files and summarise results"
          className="w-full bg-transparent px-2 pb-4 pt-5 text-[15px] text-slate-900 focus:outline-none"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <span className="flex size-4 items-center justify-center rounded bg-blue-600 text-[8px] font-bold text-white">
                AI
              </span>
              claude-3-sonnet
              <ChevronDown className="size-3 text-slate-400" />
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <SlidersHorizontal className="size-3.5 text-slate-500" />
              Tone
              <ChevronDown className="size-3 text-slate-400" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Voice input"
              className="p-1.5 text-slate-400 transition-colors hover:text-slate-600"
            >
              <Mic className="size-4" />
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 py-1.5 pl-3.5 pr-1.5 text-sm font-medium text-white shadow-[0_6px_20px_rgba(37,99,235,0.45)] transition-all hover:bg-blue-500"
            >
              <span className="inline-flex items-center gap-1.5">
                <SendHorizontal className="size-4" />
                Send
              </span>
              <span className="h-5 w-px bg-white/25" />
              <span className="flex size-6 items-center justify-center rounded-md bg-white/20">
                <Command className="size-3" />
              </span>
              <span className="flex size-6 items-center justify-center rounded-md bg-white/20">
                <CornerDownLeft className="size-3" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </motion.section>
  );
});
