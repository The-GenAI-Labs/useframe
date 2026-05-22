"use client";

import { memo, useCallback, useRef, useState, useEffect } from "react";

const CARDS = [
    { id: "1", image: "/auth/login1.png", topic: "Fitness" },
    { id: "2", image: "/auth/login2.png", topic: "Beauty" },
    { id: "3", image: "/auth/login3.png", topic: "Sports" },
    { id: "4", image: "/auth/login4.png", topic: "AI" },
    { id: "5", image: "/auth/login5.png", topic: "Food" },
    { id: "6", image: "/auth/login6.png", topic: "Tech" },
    { id: "7", image: "/auth/login7.png", topic: "Tuition" },
    { id: "8", image: "/auth/login8.png", topic: "School" },
    { id: "9", image: "/auth/login9.png", topic: "Gadget" },
    { id: "10", image: "/auth/login10.png", topic: "Other" },
] as const;

const Card = memo(function Card({
    card,
    onClick,
}: {
    card: (typeof CARDS)[number];
    onClick: (id: string) => void;
}) {
    const handleClick = useCallback(() => onClick(card.id), [card.id, onClick]);

    return (
        <button
            onClick={handleClick}
            className="group relative w-full rounded-3xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300"
            style={{ height: "220px" }}
        >
            <img
                src={card.image}
                alt={card.topic}
                className="w-full h-full border-[15px] border-white object-cover transition-transform rounded-4xl duration-500 ease-out group-hover:scale-[1.03]"
            />

            {/* Topic pill */}
            <div className="absolute bottom-3 left-0 right-0 flex justify-center z-20">
                <div className="w-full flex items-center justify-between px-5 py-3 rounded-bl-3xl rounded-br-3xl bg-white/60  backdrop-blur-xs border border-white/70">
                    <span className="text-gray-800/90 text-sm font-medium tracking-wide ">
                        {card.topic}
                    </span>
                    {/* Arrow link icon */}
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="black"
                        stroke="rgba(55,65,81,0.7)"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="cursor-pointer"
                    >
                        <line x1="7" y1="17" x2="17" y2="7" />
                        <polyline points="7 7 17 7 17 17" />
                    </svg>
                </div>
            </div>
        </button>
    );
});

const LEFT_CARDS = CARDS.filter((_, i) => i % 2 === 0);
const RIGHT_CARDS = CARDS.filter((_, i) => i % 2 === 1);

function ScrollColumn({
    cards,
    onCardClick,
}: {
    cards: readonly (typeof CARDS)[number][];
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
            {/* Up arrow */}
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

            {/* Scrollable column */}
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

            {/* Down arrow */}
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
    onCardClick: (id: string) => void;
}

export default memo(function WelcomeCards({ onCardClick }: WelcomeCardsProps) {
    return (
        <div className="flex gap-3 w-full px-1 py-1">
            <ScrollColumn cards={LEFT_CARDS} onCardClick={onCardClick} />
            <ScrollColumn cards={RIGHT_CARDS} onCardClick={onCardClick} />
        </div>
    );
});