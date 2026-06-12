"use client";

import { memo } from "react";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";

export const CryptoWalletCard = memo(function CryptoWalletCard() {
  return (
    <div className="w-60 rounded-2xl bg-white p-3 shadow-xl shadow-sky-950/10">
      <div className="flex gap-2.5">
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-xs font-bold leading-snug text-slate-900">
            Secure &amp; Easy-to-Use Crypto Wallet
          </p>
          <p className="mt-1.5 text-[9px] leading-relaxed text-slate-500">
            Store, Send &amp; Receive Cryptocurrencies with Confidence
          </p>
          <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-lime-300 px-2 py-1 text-[8px] font-semibold text-slate-900">
            Get Started
            <ArrowUpRight className="size-2" />
          </span>
          <div className="mt-2 flex gap-1">
            <span className="rounded-full border border-slate-200 px-1.5 py-0.5 text-[7px] font-medium text-slate-600">
              App Store
            </span>
            <span className="rounded-full border border-slate-200 px-1.5 py-0.5 text-[7px] font-medium text-slate-600">
              Google Play
            </span>
          </div>
        </div>
        <div className="relative h-34 w-24 shrink-0 overflow-hidden rounded-lg bg-lime-300">
          {/* zoom into the top-right of the screenshot, where the phone mockup sits */}
          <Image
            src="/auth/login20.png"
            alt="Crypto wallet app preview"
            fill
            sizes="240px"
            className="origin-top-right scale-240 object-cover object-right-top"
          />
        </div>
      </div>
    </div>
  );
});
