"use client";

import { memo, useCallback, useRef, useState, useEffect } from "react";

export type WelcomeTab = "RESEARCH" | "WEBSITE" | "SEO" | "DEPLOY";

const CARDS_BY_TAB: Record<WelcomeTab, { id: string; image: string; topic: string }[]> = {
    RESEARCH: [
        { id: "r1", image: "/auth/login1.png", topic: "Fitness" },
        { id: "r2", image: "/auth/login2.png", topic: "Beauty" },
        { id: "r3", image: "/auth/login3.png", topic: "Sports" },
        { id: "r4", image: "/auth/login4.png", topic: "AI" },
        { id: "r5", image: "/auth/login5.png", topic: "Food" },
        { id: "r6", image: "/auth/login6.png", topic: "Tech" },
        { id: "r7", image: "/auth/login7.png", topic: "Tuition" },
        { id: "r8", image: "/auth/login8.png", topic: "School" },
        { id: "r9", image: "/auth/login9.png", topic: "Gadget" },
        { id: "r10", image: "/auth/login10.png", topic: "Other" },
    ],
    WEBSITE: [
        { id: "w1", image: "/auth/login2.png", topic: "Landing page" },
        { id: "w2", image: "/auth/login4.png", topic: "SaaS site" },
        { id: "w3", image: "/auth/login6.png", topic: "Portfolio" },
        { id: "w4", image: "/auth/login8.png", topic: "Agency" },
        { id: "w5", image: "/auth/login1.png", topic: "E-commerce" },
        { id: "w6", image: "/auth/login3.png", topic: "Startup" },
    ],
    SEO: [
        { id: "s1", image: "/auth/login5.png", topic: "Keyword audit" },
        { id: "s2", image: "/auth/login7.png", topic: "Site speed" },
        { id: "s3", image: "/auth/login9.png", topic: "Backlinks" },
        { id: "s4", image: "/auth/login10.png", topic: "Meta tags" },
        { id: "s5", image: "/auth/login2.png", topic: "Sitemap" },
        { id: "s6", image: "/auth/login6.png", topic: "Competitors" },
    ],
    DEPLOY: [
        { id: "d1", image: "/auth/login3.png", topic: "Vercel" },
        { id: "d2", image: "/auth/login8.png", topic: "Custom domain" },
        { id: "d3", image: "/auth/login1.png", topic: "SSL & DNS" },
        { id: "d4", image: "/auth/login4.png", topic: "Rollback" },
    ],
};

type WelcomeCard = { id: string; image: string; topic: string };

const Card = memo(function Card({
    card,
    onClick,
}: {
    card: WelcomeCard;
    onClick: (id: string) => void;
}) {
    const [copied, setCopied] = useState(false);
    const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleClick = useCallback(() => onClick(card.id), [card.id, onClick]);

    const handleCopy = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(card.topic);
        setCopied(true);
        if (copyTimer.current) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopied(false), 2000);
    }, [card.topic]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(card.id);
            }
        },
        [card.id, onClick]
    );

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className="group relative w-full rounded-3xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer"
            style={{ height: "220px" }}
        >
            <img
                src={card.image}
                alt={card.topic}
                className="w-full h-full border-15 border-white object-cover transition-transform rounded-4xl duration-500 ease-out group-hover:scale-[1.03]"
            />

            <div className="absolute bottom-3 left-0 right-0 flex justify-center z-20">
                <div className="w-full flex flex-col gap-1.5 px-5 py-3 rounded-bl-3xl rounded-br-3xl bg-white/60 backdrop-blur-xs border border-white/70">
                    <div className="flex items-center justify-between">
                        <span className="text-gray-800/90 text-sm font-medium tracking-wide">
                            {card.topic}
                        </span>
                        <div className="flex justify-around gap-3 items-center">
                            <button
                                onClick={handleCopy}
                                className="flex items-center gap-1.5 w-fit cursor-pointer group/copy"
                            >
                                <span
                                    className={`text-[11px] font-medium tracking-wide transition-all duration-300 ${copied ? "text-green-500" : "text-gray-500/70 group-hover/copy:text-gray-700"
                                        }`}
                                >
                                    {copied ? "Copied!" : "Copy prompt"}
                                </span>
                                <span className={`transition-all duration-300 ${copied ? "text-green-500" : "text-gray-400 group-hover/copy:text-gray-600"}`}>
                                    {copied ? (
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    ) : (
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="9" y="9" width="13" height="13" rx="2" />
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                        </svg>
                                    )}
                                </span>
                            </button> 
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide cursor-pointer lucide-external-link-icon lucide-external-link"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

function ScrollColumn({
    cards,
    onCardClick,
}: {
    cards: WelcomeCard[];
    onCardClick: (id: string) => void;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [atTop, setAtTop] = useState(true);
    const [atBottom, setAtBottom] = useState(false);

    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        setAtTop(el.scrollTop < 8);
        setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 8);
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        handleScroll();
        el.addEventListener("scroll", handleScroll, { passive: true });
        return () => el.removeEventListener("scroll", handleScroll);
    }, [handleScroll]);

    const scrollDown = useCallback(() => {
        scrollRef.current?.scrollBy({ top: 232, behavior: "smooth" });
    }, []);

    const scrollUp = useCallback(() => {
        scrollRef.current?.scrollBy({ top: -232, behavior: "smooth" });
    }, []);

    return (
        <div className="relative flex-1">
            {!atTop && (
                <button
                    onClick={scrollUp}
                    className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center w-7 h-7 rounded-full bg-white border border-black/10 shadow-md hover:shadow-lg hover:scale-110 transition-all duration-200 cursor-pointer"
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-black/50">
                        <polyline points="18 15 12 9 6 15" />
                    </svg>
                </button>
            )}

            <div
                ref={scrollRef}
                className="flex flex-col gap-3 overflow-y-auto rounded-3xl"
                style={{
                    height: "220px",
                    scrollbarWidth: "none",
                    msOverflowStyle: "none",
                    scrollSnapType: "y mandatory",
                }}
            >
                {cards.map((card) => (
                    <div key={card.id} style={{ scrollSnapAlign: "start", flexShrink: 0 }}>
                        <Card card={card} onClick={onCardClick} />
                    </div>
                ))}
            </div>

            {!atBottom && (
                <button
                    onClick={scrollDown}
                    className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center w-7 h-7 rounded-full bg-white border border-black/10 shadow-md hover:shadow-lg hover:scale-110 transition-all duration-200 cursor-pointer"
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-black/50">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </button>
            )}
        </div>
    );
}

interface WelcomeCardsProps {
    tab: WelcomeTab;
    onCardClick: (id: string) => void;
}

export default memo(function WelcomeCards({ tab, onCardClick }: WelcomeCardsProps) {
    const cards = CARDS_BY_TAB[tab];
    const leftCards = cards.filter((_, i) => i % 2 === 0);
    const rightCards = cards.filter((_, i) => i % 2 === 1);

    return (
        <div className="flex flex-row gap-3 w-full px-1 py-1">
            <ScrollColumn cards={leftCards} onCardClick={onCardClick} />
            <ScrollColumn cards={rightCards} onCardClick={onCardClick} />
        </div>
    );
});