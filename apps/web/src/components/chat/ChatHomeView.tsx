"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { isFreeTierExhausted } from "@/lib/freeTierError";
import GridBackground from "@/components/chat/GridBackground";
import WelcomeCards, { type WelcomeTab } from "@/components/chat/WelcomeCards";
import ChatInput from "@/components/chat/ChatInput";
import { useClarify } from "@/hooks/useClarify";
import { useClarifyStore } from "@/stores/clarifyStore";
import { serif } from "@/components/home/fonts";
import { PipelineToggle, type PipelineToggleStep } from "@/components/workspace-tabs/PipelineToggle";
import { ExtractFlowPanel } from "@/components/chat/ExtractFlowPanel";
import { usePendingPromptStore } from "@/stores/pendingPromptStore";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import WorkspaceLoading from "../../../app/(chat)/project/[slug]/loading";
import { projectsApi, type ProjectDetail } from "@/lib/api/services/projects.service";
import type { CreateProjectInput } from "@repo/schemas";

const HOME_STEPS: PipelineToggleStep[] = [
    { id: "RESEARCH", label: "Research", status: "PENDING" },
    { id: "WEBSITE", label: "Website", status: "PENDING" },
    { id: "SEO", label: "SEO", status: "PENDING" },
    { id: "DEPLOY", label: "Deploy", status: "PENDING" },
];

function getGreeting(hour: number): string {
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
}

function ChatHomeSkeleton() {
    const glass = "bg-white/30 backdrop-blur-md border border-white/40"
    return (
        <div className="relative flex h-full w-full overflow-hidden" style={{ backgroundColor: "var(--bg-shell) !important" }}>
            <GridBackground />

            <div className="relative z-10 flex flex-col items-center justify-center w-full h-full px-8 py-12">
                <div className="flex flex-col gap-6 w-1/2 min-w-[420px] animate-pulse">
                    <div className="flex flex-col items-center text-center gap-3">
                        <div className={`h-6 w-32 rounded-full ${glass}`} />
                        <div className={`h-10 w-80 rounded-lg ${glass}`} />
                        <div className={`h-5 w-56 rounded-lg ${glass}`} />
                    </div>

                    <div className="flex flex-row gap-3 w-full px-1 py-1">
                        <div className={`flex-1 rounded-3xl ${glass}`} style={{ height: "220px" }} />
                        <div className={`flex-1 rounded-3xl ${glass}`} style={{ height: "220px" }} />
                    </div>

                    <div className={`w-full h-24 rounded-3xl ${glass}`} />
                </div>
            </div>
        </div>
    );
}

export default function ChatHomeView() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const shouldAutoFocus = searchParams.get("focus") === "1";
    const { clarify } = useClarify();
    const { user } = useAuth();
    const [isThinking, setIsThinking] = useState(false);
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    const [greeting, setGreeting] = useState("Hi");
    const [showSkeleton, setShowSkeleton] = useState(true);
    const [activeTab, setActiveTab] = useState<WelcomeTab>("RESEARCH");
    // New, additive guided-setup flow (/extract -> dynamic questions -> minimal
    // create form -> /plan SSE). Entirely separate from the existing
    // useClarifyStore turn-by-turn chat flow below, which is left untouched.
    const [useGuidedSetup, setUseGuidedSetup] = useState(false);
    // Once a project exists — either from typing an idea here, or from the
    // create-project modal's "Start generation" — the home page renders the
    // same 4-step human-in-the-loop pipeline (WorkspaceShell) that
    // /project/[slug] uses, instead of navigating away. Research auto-starts
    // as soon as the project exists (see ResearchTab); Website stays LOCKED
    // server-side until Research is approved.
    const [activeProject, setActiveProject] = useState<ProjectDetail | null>(null);
    const [projectLoadError, setProjectLoadError] = useState(false);

    useEffect(() => {
        setGreeting(getGreeting(new Date().getHours()));
    }, []);

    // Arriving from the create-project modal's "Start generation" — load
    // that project and render its pipeline right here on /.
    useEffect(() => {
        const projectSlug = searchParams.get("project");
        if (!projectSlug || searchParams.get("start") !== "1") return;
        let cancelled = false;
        projectsApi
            .getBySlug(projectSlug)
            .then((data) => {
                if (!cancelled) setActiveProject(data);
            })
            .catch(() => {
                if (!cancelled) setProjectLoadError(true);
            });
        return () => {
            cancelled = true;
        };
    }, [searchParams]);

    useEffect(() => {
        const timer = setTimeout(() => setShowSkeleton(false), 1000);
        return () => clearTimeout(timer);
    }, []);

    const userName = user?.name ?? "there";

    const {
        phase,
        startupIdea,
        turns,
        pendingQuestions,
        answers,
        inferredName,
        inferredNiche,
        inferredTargetAudience,
        inferredBrandPersonality,
        inferredPricePositioning,
        inferredBusinessModel,
        inferredDifferentiator,
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

    // Creates the project via the same POST /projects the create-project
    // modal uses (tier/credit resolution, PipelineState init, etc. all
    // happen server-side as a result) instead of calling /generate directly
    // — that's what makes Research auto-start and Website stay gated behind
    // approval, exactly like a project created from the modal.
    const runGeneration = useCallback(
        async (
            niche: string,
            targetAudience: string,
            name: string,
            brandPersonality?: string,
            pricePositioning?: string,
            businessModel?: string,
            differentiator?: string,
        ) => {
            setGenerating();
            setIsCreatingProject(true);
            try {
                const input: CreateProjectInput = {
                    name,
                    startupIdea,
                    niche: niche as CreateProjectInput["niche"],
                    targetAudience,
                    inputType,
                    sourceUrl: sourceUrl ?? undefined,
                    extracted: {
                        brandPersonality: brandPersonality ?? inferredBrandPersonality ?? undefined,
                        pricePositioning: pricePositioning ?? inferredPricePositioning ?? undefined,
                        businessModel: businessModel ?? inferredBusinessModel ?? undefined,
                        differentiator: differentiator ?? inferredDifferentiator ?? undefined,
                    },
                };
                const result = await projectsApi.create(input);
                const project = await projectsApi.getBySlug(result.project.slug);
                reset();
                setActiveProject(project);
            } catch (err) {
                if (isFreeTierExhausted(err)) {
                    router.push("/billing");
                    return;
                }
                setError(err instanceof Error ? err.message : "Couldn't create the project");
            } finally {
                setIsCreatingProject(false);
            }
        },
        [
            router,
            setGenerating,
            startupIdea,
            inputType,
            sourceUrl,
            inferredBrandPersonality,
            inferredPricePositioning,
            inferredBusinessModel,
            inferredDifferentiator,
            reset,
            setError,
        ],
    );

    const handleSubmit = useCallback(
        async (message: string) => {
            if (phase === "idle") {
                startIdea(message);
                setIsThinking(true);
                try {
                    const result = await clarify(message);
                    setIsThinking(false);
                    setQuestions(result.ready ? [] : result.questions ?? [], {
                        name: result.name,
                        niche: result.niche,
                        targetAudience: result.targetAudience,
                        brandPersonality: result.brandPersonality,
                        pricePositioning: result.pricePositioning,
                        businessModel: result.businessModel,
                        differentiator: result.differentiator,
                    });
                    if (result.ready) {
                        runGeneration(
                            result.niche ?? "OTHER",
                            result.targetAudience ?? "General audience",
                            result.name ?? message.slice(0, 40),
                            result.brandPersonality,
                            result.pricePositioning,
                            result.businessModel,
                            result.differentiator,
                        );
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
                    setQuestions(result.ready ? [] : result.questions ?? [], {
                        name: result.name,
                        niche: result.niche,
                        targetAudience: result.targetAudience,
                        brandPersonality: result.brandPersonality,
                        pricePositioning: result.pricePositioning,
                        businessModel: result.businessModel,
                        differentiator: result.differentiator,
                    });
                    if (result.ready) {
                        runGeneration(
                            result.niche ?? inferredNiche ?? "OTHER",
                            result.targetAudience ?? inferredTargetAudience ?? "General audience",
                            result.name ?? inferredName ?? startupIdea.slice(0, 40),
                            result.brandPersonality ?? inferredBrandPersonality ?? undefined,
                            result.pricePositioning ?? inferredPricePositioning ?? undefined,
                            result.businessModel ?? inferredBusinessModel ?? undefined,
                            result.differentiator ?? inferredDifferentiator ?? undefined,
                        );
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
            inferredBrandPersonality,
            inferredPricePositioning,
            inferredBusinessModel,
            inferredDifferentiator,
        ],
    );

    const handleCardClick = useCallback((id: string) => {
        console.log("card:", id);
    }, []);

    // A visitor typed an idea into the marketing homepage's hero chatbox
    // while signed out, then landed here after completing sign-in. Pick up
    // that stored prompt once and kick off the normal clarify flow with it,
    // exactly as if they'd typed it into ChatInput themselves.
    const pendingPrompt = usePendingPromptStore((s) => s.prompt);
    const clearPendingPrompt = usePendingPromptStore((s) => s.clear);
    useEffect(() => {
        if (!pendingPrompt || phase !== "idle" || showSkeleton) return;
        clearPendingPrompt();
        handleSubmit(pendingPrompt);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingPrompt, phase, showSkeleton]);

    const isIdle = phase === "idle";

    // A project exists (just created here, or arrived via ?project=&start=1
    // from the create-project modal) — render its 4-step pipeline right on
    // the home page instead of the idea prompt.
    const projectSlugParam = searchParams.get("project");
    const awaitingProjectFromParam = projectSlugParam && searchParams.get("start") === "1" && !activeProject && !projectLoadError;

    if (isCreatingProject || awaitingProjectFromParam) {
        return <WorkspaceLoading />;
    }

    if (projectLoadError) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm font-semibold text-pri">Couldn&apos;t load that project</p>
                <p className="text-xs text-mut">It may have been deleted, or the link is invalid.</p>
            </div>
        );
    }

    if (activeProject) {
        return (
            <div className="flex h-full flex-col bg-surface">
                <WorkspaceShell project={activeProject} />
            </div>
        );
    }

    if (showSkeleton) {
        return <ChatHomeSkeleton />;
    }

    return (
        <div className="relative flex h-full w-full overflow-hidden" style={{ backgroundColor: "var(--bg-shell) !important" }}>
            <GridBackground />

            <div className="relative z-10 flex flex-col items-center justify-center w-full h-full px-8 py-12">
                <div className="flex flex-col gap-6 w-1/2 min-w-[420px]">
                    {isIdle ? (
                        <>
                            <div className="flex flex-col items-center text-center">
                                <span
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium mb-3"
                                    style={{ backgroundColor: "var(--bg-bubble)", color: "var(--text-secondary)" }}
                                >
                                    ✨ Welcome back
                                </span>
                                <h1
                                    className={`${serif.className} text-5xl tracking-tight`}
                                    style={{ color: "var(--text-primary)" }}
                                >
                                    {greeting}, {userName}
                                </h1>
                                {/* <p className="text-lg mt-1 font-normal" style={{ color: "var(--text-secondary)" }}>
                                    How can I assist you today?
                                </p> */}
                            </div>
                            <PipelineToggle
                                steps={HOME_STEPS}
                                activeStep={activeTab}
                                interactive
                                ignoreLock
                                onSelectStep={(id) => setActiveTab(id as WelcomeTab)}
                            />
                            <WelcomeCards tab={activeTab} onCardClick={handleCardClick} />
                            <button
                                type="button"
                                onClick={() => setUseGuidedSetup((v) => !v)}
                                className="self-center text-[12px] font-medium text-mut hover:text-sec transition-colors cursor-pointer underline underline-offset-2"
                            >
                                {useGuidedSetup ? "Use chat instead" : "Try the new guided setup"}
                            </button>
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

                    {isIdle && useGuidedSetup ? (
                        <ExtractFlowPanel />
                    ) : (
                        phase !== "generating" && (
                            <ChatInput onSubmit={handleSubmit} autoFocus={shouldAutoFocus} />
                        )
                    )}
                </div>
            </div>
        </div>
    );
}
