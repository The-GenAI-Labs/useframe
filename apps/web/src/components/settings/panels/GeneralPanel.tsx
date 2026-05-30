"use client";

import { memo } from "react";
import { SettingsRow } from "../ui/SettingsRow";
import { SectionHeading } from "../ui/SectionHeading";
import { AppearanceToggle } from "../ui/AppearanceToggle";

export const GeneralPanel = memo(function GeneralPanel() {
    return (
        <div className="flex flex-col">
            <SectionHeading>Profile</SectionHeading>
            <div className="mt-3">
                <SettingsRow label="Avatar">
                    <div className="w-9 h-9 rounded-full bg-black/8 border border-black/[0.1] flex items-center justify-center text-[14px] font-semibold text-black/55">
                        R
                    </div>
                </SettingsRow>
                <SettingsRow label="Full name">
                    <input
                        type="text"
                        defaultValue="Rishabh"
                        className="w-48 px-3 py-1.5 rounded-lg bg-black/3 border border-black/[0.08] text-[13px] text-black/70 outline-none focus:border-black/20 transition-colors"
                    />
                </SettingsRow>
                <SettingsRow label="What should Claude call you?">
                    <input
                        type="text"
                        defaultValue="Rishabh"
                        className="w-48 px-3 py-1.5 rounded-lg bg-black/3 border border-black/[0.08] text-[13px] text-black/70 outline-none focus:border-black/20 transition-colors"
                    />
                </SettingsRow>
                <SettingsRow label="What best describes your work?">
                    <button
                        type="button"
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] text-black/35 hover:text-black/55 transition-colors cursor-pointer"
                    >
                        Select
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>
                </SettingsRow>
                <div className="py-4 border-b border-black/[0.06]">
                    <p className="text-[14px] text-black/60 mb-1.5">Instructions for Claude</p>
                    <p className="text-[12px] text-black/35 mb-3 leading-relaxed">
                        Claude will keep these in mind across chats within Anthropic&apos;s guidelines.{" "}
                        <span className="underline cursor-pointer text-black/45 hover:text-black/60 transition-colors">Learn more</span>
                    </p>
                    <textarea
                        rows={3}
                        placeholder="e.g. I primarily code in Python (not a coding beginner)"
                        className="w-full px-3.5 py-3 rounded-xl bg-black/3 border border-black/[0.08] text-[13px] text-black/65 placeholder:text-black/25 outline-none focus:border-black/15 resize-none transition-colors leading-relaxed"
                    />
                </div>
            </div>

            <SectionHeading>Preferences</SectionHeading>
            <div className="mt-3">
                <SettingsRow label="Appearance">
                    <AppearanceToggle />
                </SettingsRow>
                <SettingsRow label="Chat font">
                    <button
                        type="button"
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] text-black/55 hover:text-black/75 transition-colors cursor-pointer"
                    >
                        Anthropic Serif
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>
                </SettingsRow>
            </div>
        </div>
    );
});
