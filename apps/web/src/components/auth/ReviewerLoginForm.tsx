"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/authContext";

const API_SERVICE_URL = process.env.NEXT_PUBLIC_API_SERVICE_URL ?? "http://localhost:4000";

const schema = z.object({
    email: z.string().email("Enter a valid email address"),
    password: z.string().min(1, "Enter your password"),
});

type FormValues = z.infer<typeof schema>;

export default function ReviewerLoginForm() {
    const router = useRouter();
    const { login } = useAuth();
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [serverError, setServerError] = useState("");
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({ resolver: zodResolver(schema) });

    const onSubmit = async (values: FormValues) => {
        setServerError("");
        try {
            const res = await fetch(`${API_SERVICE_URL}/api/auth/reviewer-login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ ...values, acceptedTerms: true }),
            });
            const body = await res.json();
            if (!res.ok || !body.success) {
                setServerError(body?.message ?? "Invalid email or password");
                return;
            }
            login(body.data.accessToken, body.data.user);
            router.replace("/");
        } catch {
            setServerError("Something went wrong. Please try again.");
        }
    };

    const inputClass =
        "h-11 text-gray-600 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-blue-300";

    return (
        <div className="w-full max-w-[380px] mx-auto flex flex-col gap-5">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-zinc-900">Reviewer sign in</h1>
                <p className="text-sm text-zinc-500">For the payment provider&apos;s review account only.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
                <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-600">
                    Email
                    <Input type="email" autoComplete="username" {...register("email")} className={inputClass} />
                </label>
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}

                <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-600">
                    Password
                    <Input
                        type="password"
                        autoComplete="current-password"
                        {...register("password")}
                        className={inputClass}
                    />
                </label>
                {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}

                <label className="flex items-start gap-2.5 text-xs text-zinc-500 select-none cursor-pointer">
                    <input
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={(e) => setAgreedToTerms(e.target.checked)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>
                        I agree to the{" "}
                        <Link href="/terms" className="underline hover:text-zinc-700 transition-colors">
                            Terms &amp; Conditions
                        </Link>{" "}
                        and{" "}
                        <Link href="/privacy" className="underline hover:text-zinc-700 transition-colors">
                            Privacy Policy
                        </Link>
                    </span>
                </label>

                {serverError && (
                    <p role="alert" className="text-xs text-red-500">
                        {serverError}
                    </p>
                )}

                <Button
                    type="submit"
                    disabled={isSubmitting || !agreedToTerms}
                    className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium border-0 cursor-pointer gap-2"
                >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in"}
                </Button>
            </form>
        </div>
    );
}
