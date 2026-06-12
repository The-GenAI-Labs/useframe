"use client";

import { memo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const NAV_LINKS = [
  { label: "Pricing", href: "#pricing" },
  { label: "Features", href: "#features" },
  { label: "Docs", href: "#docs" },
];

export const Navbar = memo(function Navbar({ serifClassName }: { serifClassName: string }) {
  return (
    <header className="sticky top-0 z-50 w-full">
      <nav aria-label="Main" className="relative mx-auto flex h-18 w-full max-w-7xl items-center justify-between px-6">
        <Link href="/" className={`${serifClassName} text-2xl tracking-tight text-slate-950`}>
          UseFrame
        </Link>

        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-10 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-[15px] font-medium text-slate-800 transition-colors hover:text-slate-950"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <Link
          href="/signup"
          className="group inline-flex items-center gap-2 rounded-xl bg-blue-600 py-1.5 pl-4 pr-1.5 text-sm font-medium text-white shadow-[0_8px_24px_rgba(37,99,235,0.4)] transition-all hover:bg-blue-500 hover:shadow-[0_8px_28px_rgba(37,99,235,0.55)]"
        >
          Get early access
          <span className="flex size-6 items-center justify-center rounded-lg bg-white/20 transition-transform group-hover:translate-x-0.5">
            <ArrowRight className="size-3.5" />
          </span>
        </Link>
      </nav>
    </header>
  );
});
