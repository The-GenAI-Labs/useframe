"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, ArrowRight, Loader2 } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OAuthButton } from "@/components/auth/OAuthButton";
import { checkUserExists, signInWithEmail, setOAuthConsent } from "@/lib/auth-actions";
import { useAuthStore } from "@/store/authStore";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
    oauth: "Something went wrong signing you in. Please try again.",
    oauth_not_configured: "sign-in isn't set up yet — use email instead, or try a different provider.",
    terms_required: "Please accept the Terms of Service before continuing.",
};

function oauthErrorMessage(error: string, provider: string | null): string {
    if (error === "oauth_not_configured") {
        const label = provider === "google" ? "Google" : provider === "github" ? "GitHub" : "That provider";
        return `${label} ${OAUTH_ERROR_MESSAGES.oauth_not_configured}`;
    }
    return OAUTH_ERROR_MESSAGES[error] ?? OAUTH_ERROR_MESSAGES.oauth;
}

const schema = z.object({
    email: z.string().email("Enter a valid email address"),
});

type FormValues = z.infer<typeof schema>;

type Step = "email" | "confirm";

function InlineSeparator() {
    return (
        <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-200" />
            <span className="text-xs text-zinc-400">or</span>
            <div className="h-px flex-1 bg-zinc-200" />
        </div>
    );
}

export default function AuthForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [step, setStep] = useState<Step>("email");
    const [isReturning, setIsReturning] = useState(false);
    const [submittedEmail, setSubmittedEmail] = useState("");
    const [serverError, setServerError] = useState("");
    const [oauthError, setOauthError] = useState<string | null>(null);
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [turnstileToken, setTurnstileToken] = useState("");
    const turnstileRef = useRef<TurnstileInstance>(null);
    const [isPending, startTransition] = useTransition();
    const { magicLinkSent, setMagicLinkSent, resetMagicLink } = useAuthStore();

    // The OAuth buttons redirect away immediately, with no chance to check
    // consent again once that navigation starts — so we mirror the checkbox
    // into sessionStorage on every change, and /auth/callback reads it back
    // after the round trip to Google/GitHub completes.
    useEffect(() => {
        setOAuthConsent(agreedToTerms);
    }, [agreedToTerms]);

    useEffect(() => {
        const error = searchParams.get("error");
        if (!error) return;
        setOauthError(oauthErrorMessage(error, searchParams.get("provider")));
        router.replace("/signin");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
    });

    const onSubmit = (data: FormValues) => {
        setServerError("");

        if (step === "email") {
            startTransition(async () => {
                const exists = await checkUserExists(data.email);
                setIsReturning(exists);
                setSubmittedEmail(data.email);
                setStep("confirm");
            });
            return;
        }

        if (!agreedToTerms) {
            setServerError("Please accept the Terms of Service to continue.");
            return;
        }
        if (!turnstileToken) {
            setServerError("Verification is still loading — try again in a moment.");
            return;
        }

        startTransition(async () => {
            const result = await signInWithEmail(data.email, turnstileToken);
            if (result.success) {
                setMagicLinkSent(data.email);
            } else {
                setServerError(result.error ?? "Something went wrong");
                turnstileRef.current?.reset();
            }
        });
    };

    if (magicLinkSent) {
        return (
            <div className="w-full max-w-[380px] mx-auto flex flex-col items-center gap-5 text-center">
                <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">
                    <Mail className="w-6 h-6 text-blue-500" />
                </div>
                <div className="flex flex-col gap-1.5">
                    <h1 className="text-2xl font-bold text-gray-800">Check your inbox</h1>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                        We sent a sign-in link to{" "}
                        <span className="font-semibold text-zinc-700">{submittedEmail}</span>.
                        Click it to continue.
                    </p>
                </div>
                <p className="text-xs text-zinc-400">
                    Wrong address?{" "}
                    <button
                        type="button"
                        onClick={() => {
                            resetMagicLink();
                            setStep("email");
                            setSubmittedEmail("");
                        }}
                        className="text-blue-500 hover:text-blue-600 font-medium transition-colors cursor-pointer"
                    >
                        Start over
                    </button>
                </p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-[380px] mx-auto flex flex-col gap-5">
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-bold tracking-tight text-gray-800">
                    {step === "email"
                        ? "Welcome to UseFrame"
                        : isReturning
                        ? "Welcome back"
                        : "Create your account"}
                </h1>
                <p className="text-sm text-zinc-500">
                    {step === "email"
                        ? "Sign in or create an account to continue."
                        : isReturning
                        ? `Continue as ${submittedEmail}`
                        : `We'll create an account for ${submittedEmail}`}
                </p>
            </div>

            {oauthError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-600">
                    {oauthError}
                </p>
            )}

            <label className="flex items-start gap-2.5 text-xs text-zinc-500 select-none cursor-pointer">
                <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span>
                    I agree to the{" "}
                    <Link href="/terms" target="_blank" className="underline hover:text-zinc-700 transition-colors">
                        Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" target="_blank" className="underline hover:text-zinc-700 transition-colors">
                        Privacy Policy
                    </Link>
                </span>
            </label>

            <div className="flex flex-col gap-3">
                <OAuthButton provider="google" disabled={!agreedToTerms} />
                <OAuthButton provider="github" disabled={!agreedToTerms} />
            </div>

            <InlineSeparator />

            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
                <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                    <Input
                        type="email"
                        placeholder="you@example.com"
                        {...register("email")}
                        readOnly={step === "confirm"}
                        className="pl-9 h-11 text-gray-600 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-blue-300 read-only:bg-zinc-50 read-only:text-zinc-500"
                    />
                </div>

                {(errors.email || serverError) && (
                    <p className="text-xs text-red-500">
                        {errors.email?.message ?? serverError}
                    </p>
                )}

                {step === "confirm" && (
                    <>
                        <button
                            type="button"
                            onClick={() => { setStep("email"); setServerError(""); }}
                            className="text-xs text-blue-500 hover:text-blue-600 text-left cursor-pointer transition-colors"
                        >
                            Use a different email
                        </button>

                        {TURNSTILE_SITE_KEY && (
                            <Turnstile
                                ref={turnstileRef}
                                siteKey={TURNSTILE_SITE_KEY}
                                onSuccess={setTurnstileToken}
                                onExpire={() => setTurnstileToken("")}
                                options={{ size: "flexible" }}
                            />
                        )}
                    </>
                )}

                <Button
                    type="submit"
                    disabled={isPending || (step === "confirm" && !agreedToTerms)}
                    className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium border-0 cursor-pointer focus-visible:ring-0 gap-2"
                >
                    {isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : step === "email" ? (
                        <>
                            Continue
                            <ArrowRight className="w-4 h-4" />
                        </>
                    ) : isReturning ? (
                        "Send sign-in link"
                    ) : (
                        "Create account & send link"
                    )}
                </Button>
            </form>
        </div>
    );
}
