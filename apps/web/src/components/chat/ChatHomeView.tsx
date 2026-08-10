"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import GridBackground from "@/components/chat/GridBackground";
import WelcomeCards from "@/components/chat/WelcomeCards";
import ChatInput from "@/components/chat/ChatInput";
import { useClarify } from "@/hooks/useClarify";
import { useGenerationStream } from "@/hooks/useGenerationStream";
import { useClarifyStore } from "@/stores/clarifyStore";
import { useModelStore } from "@/stores/modelStore";

function getGreeting(hour: number): string {
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
}

const ORCHESTRATOR_URL =
    process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:4001";

export default function ChatHomeView() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const shouldAutoFocus = searchParams.get("focus") === "1";
    const { clarify } = useClarify();
    const { startGeneration } = useGenerationStream();
    const { selectedModelId } = useModelStore();
    const { data: session } = useSession();
    const [isThinking, setIsThinking] = useState(false);
    const [greeting, setGreeting] = useState("Hi");

    useEffect(() => {
        setGreeting(getGreeting(new Date().getHours()));
    }, []);

    const userName = session?.user?.name ?? "there";

    const {
        phase,
        startupIdea,
        turns,
        pendingQuestions,
        answers,
        inferredName,
        inferredNiche,
        inferredTargetAudience,
        inputType,
        sourceUrl,
        error,
        startIdea,
        setQuestions,
        answerQuestion,
        setGenerating,
        setError,
        reset,
    } = useClarifyStore();

    const runGeneration = useCallback(
        (niche: string, targetAudience: string, name: string) => {
            setGenerating();
            startGeneration(
                ORCHESTRATOR_URL,
                {
                    name,
                    startupIdea,
                    niche,
                    targetAudience,
                    inputType,
                    sourceUrl: sourceUrl ?? undefined,
                    modelId: selectedModelId,
                },
                {
                    onProjectCreated: ({ slug }) => {
                        reset();
                        router.push(`/project/${slug}?status=generating`);
                    },
                },
            );
        },
        [setGenerating, startGeneration, startupIdea, inputType, sourceUrl, selectedModelId, router, reset],
    );

    const handleSubmit = useCallback(
        async (message: string) => {
            if (phase === "idle") {
                startIdea(message);
                setIsThinking(true);
                try {
                    const result = await clarify(message);
                    setIsThinking(false);
                    if (result.ready) {
                        runGeneration(
                            result.niche ?? "OTHER",
                            result.targetAudience ?? "General audience",
                            result.name ?? message.slice(0, 40),
                        );
                    } else {
                        setQuestions(result.questions ?? [], {
                            name: result.name,
                            niche: result.niche,
                            targetAudience: result.targetAudience,
                        });
                    }
                } catch (err) {
                    setIsThinking(false);
                    setError(err instanceof Error ? err.message : "Something went wrong");
                }
                return;
            }

            if (phase === "clarifying") {
                const question = pendingQuestions[0];
                const nextAnswers = question
                    ? { ...answers, [question.id]: message }
                    : answers;
                if (question) answerQuestion(question.id, message);

                setIsThinking(true);
                try {
                    const result = await clarify(startupIdea, nextAnswers);
                    setIsThinking(false);
                    if (result.ready) {
                        runGeneration(
                            result.niche ?? inferredNiche ?? "OTHER",
                            result.targetAudience ?? inferredTargetAudience ?? "General audience",
                            result.name ?? inferredName ?? startupIdea.slice(0, 40),
                        );
                    } else {
                        setQuestions(result.questions ?? [], {
                            name: result.name,
                            niche: result.niche,
                            targetAudience: result.targetAudience,
                        });
                    }
                } catch (err) {
                    setIsThinking(false);
                    setError(err instanceof Error ? err.message : "Something went wrong");
                }
            }
        },
        [
            phase,
            startIdea,
            clarify,
            runGeneration,
            setQuestions,
            setError,
            pendingQuestions,
            answers,
            answerQuestion,
            startupIdea,
            inferredNiche,
            inferredTargetAudience,
            inferredName,
        ],
    );

    const handleCardClick = useCallback((id: string) => {
        console.log("card:", id);
    }, []);

    const isIdle = phase === "idle";

    return (
        <div className="relative flex h-full w-full overflow-hidden" style={{ backgroundColor: "var(--bg-shell) !important" }}>
            <GridBackground />

            <div className="relative z-10 flex flex-col items-center justify-center w-full h-full px-8 py-12">
                <div className="flex flex-col gap-6 w-1/2 min-w-[420px]">
                    {isIdle ? (
                        <>
                            <div>
                                <h1 className="text-4xl font-semibold tracking-tight flex items-center gap-2.5" style={{ color: "var(--text-primary)" }}>
                                    <span>{greeting},</span>
                                    <span>{userName}</span>
                                </h1>
                                <p className="text-xl mt-1 font-normal" style={{ color: "var(--text-secondary)" }}>
                                    How can I assist you today?
                                </p>
                            </div>
                            <WelcomeCards onCardClick={handleCardClick} />
                        </>
                    ) : (
                        <div className="flex flex-col gap-3 max-h-[45vh] overflow-y-auto pr-1" style={{ scrollbarWidth: "none" }}>
                            {turns.map((turn, i) => (
                                <div
                                    key={i}
                                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed ${
                                        turn.role === "user" ? "self-end bg-bubble text-pri" : "self-start bg-tertiary text-sec"
                                    }`}
                                >
                                    {turn.content}
                                </div>
                            ))}
                            {isThinking && (
                                <div className="self-start rounded-2xl bg-tertiary px-4 py-2.5 text-[13px] text-mut">
                                    Thinking...
                                </div>
                            )}
                            {phase === "generating" && (
                                <div className="self-start rounded-2xl bg-tertiary px-4 py-2.5 text-[13px] text-mut">
                                    Starting generation...
                                </div>
                            )}
                            {error && (
                                <div className="self-start rounded-2xl bg-red-50 px-4 py-2.5 text-[13px] text-red-600 dark:bg-red-950/30 dark:text-red-400">
                                    {error}
                                </div>
                            )}
                        </div>
                    )}

                    {phase !== "generating" && (
                        <ChatInput onSubmit={handleSubmit} autoFocus={shouldAutoFocus} />
                    )}
                </div>
            </div>
        </div>
    );
}
