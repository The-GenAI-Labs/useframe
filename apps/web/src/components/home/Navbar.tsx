"use client";

import { memo, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "Research", href: "#research" },
  { label: "Templates", href: "#templates" },
  { label: "Pricing", href: "#pricing" },
];

const smoothScrollTo = (id: string) => {
  const el = document.getElementById(id.replace("#", ""));
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};

export const Navbar = memo(function Navbar({ serifClassName }: { serifClassName: string }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleNavClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      if (href.startsWith("#")) {
        e.preventDefault();
        smoothScrollTo(href);
        setMobileOpen(false);
      }
    },
    [],
  );

  const toggleMobile = useCallback(() => setMobileOpen((v) => !v), []);

  return (
    <>
      <header
        className={`z-50 flex w-full justify-center px-4 transition-all duration-500 ease-out ${
          scrolled ? "fixed top-0" : "absolute top-0"
        }`}
      >
        <nav
          aria-label="Main"
          className={`relative flex items-center justify-between transition-all duration-500 ease-out ${
            scrolled
              ? "mt-3 h-14 w-full rounded-2xl bg-white/25 px-5 shadow-[0_8px_40px_rgba(31,68,120,0.15)] backdrop-blur-[40px] sm:w-[64%] lg:w-[36%]"
              : "mt-0 h-18 w-full max-w-7xl bg-transparent px-6"
          }`}
        >
          <Link href="/" className={`${serifClassName} cursor-pointer text-2xl tracking-tight text-slate-950`}>
            UseFrame
          </Link>

          <div className="flex-1" />

          <div className="mr-4 hidden items-center gap-5 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className="cursor-pointer text-[13px] font-medium text-slate-700 transition-colors hover:text-slate-950"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/signin"
              className="group hidden cursor-pointer items-center gap-2 rounded-xl bg-blue-600 py-1.5 pl-4 pr-1.5 text-sm font-medium text-white shadow-[0_8px_24px_rgba(37,99,235,0.4)] transition-all hover:bg-blue-500 hover:shadow-[0_8px_28px_rgba(37,99,235,0.55)] sm:inline-flex"
            >
              Get Started
              <span className="flex size-6 items-center justify-center rounded-lg bg-white/20 transition-transform group-hover:translate-x-0.5">
                <ArrowRight className="size-3.5" />
              </span>
            </Link>

            <button
              type="button"
              onClick={toggleMobile}
              className="flex cursor-pointer items-center justify-center rounded-lg p-2 text-slate-700 transition-colors hover:bg-white/40 md:hidden"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </nav>

        {mobileOpen && (
          <div className="absolute left-4 right-4 top-full mt-2 rounded-2xl border border-white/50 bg-white/80 p-4 shadow-xl backdrop-blur-2xl md:hidden">
            <ul className="space-y-1">
              {NAV_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    onClick={(e) => handleNavClick(e, link.href)}
                    className="block cursor-pointer rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-white/60"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <Link
              href="/signin"
              className="mt-3 flex cursor-pointer items-center justify-center rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-md"
            >
              Get Started
            </Link>
          </div>
        )}
      </header>

      {scrolled && <div className="h-18 w-full" />}
    </>
  );
});
