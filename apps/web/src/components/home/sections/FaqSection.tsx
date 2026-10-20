"use client";

import { memo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { SectionHeading } from "../ui/SectionHeading";

const FAQS = [
  {
    q: "What can I create with UseFrame?",
    a: "UseFrame helps you create a business website or landing page from a short description. Generate a first version, refine the design and copy through chat, preview your changes, and publish when you are ready.",
  },
  {
    q: "How is UseFrame different from a traditional website builder?",
    a: "UseFrame combines AI website generation with research-informed design recommendations. It helps you develop your page structure, content, and visual direction, then refine them in one workspace.",
  },
  {
    q: "What does research-backed design mean?",
    a: "UseFrame draws on a research library to inform design recommendations. Where supporting findings are available, citations let you explore the evidence behind a recommendation.",
  },
  {
    q: "Can I change the generated design?",
    a: "Yes. Use chat to request changes to your layout, copy, colours, or individual sections. Version history lets you review earlier versions as you refine your website.",
  },
  {
    q: "What does the Web Score assess?",
    a: "Web Score reviews visual hierarchy, typography, colour and accessibility, copy, SEO, and page speed. The assessment highlights areas for improvement on your own public website or a competitor website.",
  },
  {
    q: "How does competitor analysis help?",
    a: "Competitor analysis examines public websites to identify patterns in layout, messaging, and visual design. These insights help you make informed decisions about your own website.",
  },
  {
    q: "How do credits work?",
    a: "Your first website generation is free. Credits cover eligible actions such as generation, research, SEO reviews, and publishing. Review the current costs in your workspace before starting an action.",
  },
  {
    q: "Can I use my own domain?",
    a: "You can publish to a UseFrame subdomain. Custom domain connections depend on feature availability and require you to verify ownership and configure DNS records.",
  },
  {
    q: "Who owns the website I create?",
    a: "You retain ownership of the original content you create with UseFrame, subject to our Terms of Service. Any third-party assets remain subject to their respective licences.",
  },
  {
    q: "Do I need design or coding experience?",
    a: "No. Describe your business and what you want your website to achieve. UseFrame creates a starting point that you can review and refine through chat.",
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
          title="Frequently asked questions"
          description="A practical guide to creating and publishing with UseFrame."
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
