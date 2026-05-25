"use client";

import { useMutation } from "@tanstack/react-query";
import { sendMagicLink, signInWithGoogle, signInWithGitHub } from "@/lib/api/services/auth.service";
import { useAuthStore } from "@/store/authStore";

export function useSendMagicLink() {
    const { setMagicLinkSent, setOAuthLoading } = useAuthStore();

    return useMutation({
        mutationFn: (email: string) => sendMagicLink({ email }),
        onSuccess: (_data, email) => {
            setMagicLinkSent(email);
            setOAuthLoading(null);
        },
    });
}

export function useGoogleSignIn() {
    const { setOAuthLoading } = useAuthStore();

    return useMutation({
        mutationFn: async () => {
            setOAuthLoading("google");
            await signInWithGoogle();
        },
        onSettled: () => useAuthStore.getState().setOAuthLoading(null),
    });
}

export function useGitHubSignIn() {
    const { setOAuthLoading } = useAuthStore();

    return useMutation({
        mutationFn: async () => {
            setOAuthLoading("github");
            await signInWithGitHub();
        },
        onSettled: () => useAuthStore.getState().setOAuthLoading(null),
    });
}
