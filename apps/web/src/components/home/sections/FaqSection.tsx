"use client";

import { memo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { SectionHeading } from "../ui/SectionHeading";

const FAQS = [
  {
    q: "What exactly does UseFrame build for me?",
    a: "A complete, production-ready landing page — structure, copy, design system and SEO — generated from a short description of your idea. You get a live preview you can iterate on in chat, then deploy to a real URL when you're happy with it.",
  },
  {
    q: "How is this different from a website builder or a template?",
    a: "Templates give you a layout and leave the decisions to you. UseFrame makes the decisions — colour, typography, section order, copy framework — and cites the research behind each one. You're starting from a reasoned design, not a blank canvas with nice fonts.",
  },
  {
    q: "What does \"research-backed\" actually mean here?",
    a: "Every significant design choice links to a real finding from published design and conversion research. Hover any citation in your brief to see the claim, the paper it came from, and why it was applied to your project. Nothing is invented — if there's no finding to support a decision, it isn't cited.",
  },
  {
    q: "Do I have to accept the design it gives me?",
    a: "No. Research produces two genuinely different directions and you pick one, or let the model choose. After that, everything is editable through chat — change a section, rewrite the copy, adjust the palette — and each change creates a new version you can roll back to.",
  },
  {
    q: "What is the Web Score, and can I run it on any site?",
    a: "It's a six-criterion audit covering visual hierarchy, typography, colour and accessibility, copy, SEO, and measured page speed. It runs on any public URL — your own site or a competitor's — and the performance numbers are really measured, not estimated by a model.",
  },
  {
    q: "How does the competitor analysis work?",
    a: "On paid plans we find and scan real competitor sites in your space, then extract the design patterns they use — layout, hierarchy, components, motion. It's used as orientation for your own design, never to copy: no competitor copy or imagery is ever reproduced in what we build for you.",
  },
  {
    q: "What do credits cover, and what's free?",
    a: "Your first generation is free, no card needed. After that, credits cover generation, research, SEO passes and deploys — buy them in a pack or a custom amount, with no subscription and no expiry. You only spend when you actually generate something.",
  },
  {
    q: "Can I use my own domain?",
    a: "Yes. Deploy to a UseFrame subdomain instantly, or connect a custom domain you already own and we'll handle the DNS setup and SSL certificate for you.",
  },
  {
    q: "Who owns the sites I generate?",
    a: "You do. The pages, the copy and the design are yours to use commercially, modify, or export — we don't claim any ownership over what you create here.",
  },
  {
    q: "Do I need to know how to design or code?",
    a: "Neither. If you can describe your product in a sentence, you can ship a page. If you do write code, the generated site is clean Next.js and Tailwind, so you can take it further yourself whenever you want.",
  },
];

const FaqItem = memo(function FaqItem({
  question,
  answer,
  isOpen,
  onToggle,
  index,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.04, 0.2), ease: [0.22, 1, 0.36, 1] }}
      className={`group overflow-hidden rounded-2xl border transition-colors duration-300 ${
        isOpen
          ? "border-blue-200 bg-blue-50/40"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left sm:px-6 sm:py-5"
      >
        <span
          className={`text-[14.5px] font-medium transition-colors sm:text-[15.5px] ${
            isOpen ? "text-blue-700" : "text-slate-900"
          }`}
        >
          {question}
        </span>

        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
            isOpen
              ? "rotate-45 bg-blue-600 text-white"
              : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
          }`}
        >
          <Plus className="size-3.5" />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="px-5 pb-5 text-[13.5px] leading-[1.75] text-slate-600 sm:px-6 sm:pb-6 sm:text-[14.5px]">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

export const FaqSection = memo(function FaqSection() {
  // Single-open accordion: opening one closes the rest, so the list never
  // grows into a wall of text the user has to scroll past.
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="relative z-10 w-full scroll-mt-24 overflow-hidden px-6 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(37,99,235,0.06) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-3xl">
        <SectionHeading
          eyebrow="FAQ"
          title="Questions, answered"
          description="Everything worth knowing before you ship your first page."
        />

        <div className="mt-10 flex flex-col gap-2.5">
          {FAQS.map((faq, i) => (
            <FaqItem
              key={faq.q}
              index={i}
              question={faq.q}
              answer={faq.a}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? null : i)}
            />
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-8 text-center text-[13px] text-slate-500"
        >
          Still have a question?{" "}
          <a
            href="mailto:hello@useframe.in"
            className="font-medium text-blue-600 underline underline-offset-2 transition-colors hover:text-blue-500"
          >
            Get in touch
          </a>
        </motion.p>
      </div>
    </section>
  );
});
