"use client";

import { memo } from "react";
import Link from "next/link";
import { LEGAL, LEGAL_PAGE_LIST } from "@/lib/legal";
import { landingFont as serif } from "../fonts";

type FooterLink = { label: string; href: string };

const NAV_LINKS: FooterLink[] = [
  { label: "About", href: "/about" },
  { label: "Research", href: "/#research" },
  { label: "Pricing", href: "/pricing" },
];

const LEGAL_LINKS: FooterLink[] = LEGAL_PAGE_LIST.map((page) => ({
  label: page.label,
  href: page.path,
}));

const linkFocus =
  "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

function LinkRow({ links }: { links: FooterLink[] }) {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-1 gap-y-2">
      {links.map((l, i) => (
        <li key={l.href} className="flex items-center">
          <Link
            href={l.href}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center text-xs font-medium text-slate-600 transition-colors hover:text-slate-900 sm:min-h-0 sm:min-w-0 ${linkFocus}`}
          >
            {l.label}
          </Link>
          {i < links.length - 1 && (
            <span className="mx-2 size-1 rounded-full bg-slate-300" aria-hidden />
          )}
        </li>
      ))}
    </ul>
  );
}

const SOCIALS = [
  {
    label: "X",
    href: "https://x.com/useframe",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.261 5.632 5.903-5.632Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    label: "LinkedIn",
    href: "https://linkedin.com/company/useframe",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  {
    label: "YouTube",
    href: "https://youtube.com/@useframe",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    label: "Email",
    href: `mailto:${LEGAL.supportEmail}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
        <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
      </svg>
    ),
  },
];

export const Footer = memo(function Footer() {
  return (
    <footer className="relative w-full bg-white">
      <div className="relative overflow-hidden px-6 py-8">
        <div className="relative mx-auto flex max-w-2xl flex-col items-center text-center">
          <p
            className={`${serif.className} text-4xl tracking-tight text-slate-950 sm:text-5xl`}
          >
            UseFrame
          </p>
        </div>

        <div className="relative mx-auto mt-8 max-w-2xl h-px bg-slate-200" />

        <div className="relative mx-auto mt-6 flex max-w-2xl flex-col items-center justify-between gap-4 sm:flex-row">
          <nav aria-label="Footer">
            <LinkRow links={NAV_LINKS} />
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className={`flex size-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-900 sm:size-8 ${linkFocus}`}
              >
                {s.icon}
              </a>
            ))}
          </div>
        </div>

        <nav
          aria-labelledby="footer-legal"
          className="relative mx-auto mt-5 flex max-w-2xl flex-col items-center gap-2 sm:flex-row sm:gap-4"
        >
          <span
            id="footer-legal"
            className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase"
          >
            Legal
          </span>
          <LinkRow links={LEGAL_LINKS} />
        </nav>

        <p className="relative mt-5 text-center text-[11px] text-slate-500">
          © {new Date().getFullYear()} {LEGAL.brandName} ·{" "}
          <a
            href={`mailto:${LEGAL.supportEmail}`}
            className={`underline-offset-2 hover:text-slate-900 hover:underline ${linkFocus}`}
          >
            {LEGAL.supportEmail}
          </a>
        </p>
      </div>
    </footer>
  );
});
