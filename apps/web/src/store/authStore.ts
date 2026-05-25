import { create } from "zustand";

interface AuthState {
    magicLinkSent: boolean;
    magicLinkEmail: string;
    oauthLoading: "google" | "github" | null;

    setMagicLinkSent: (email: string) => void;
    resetMagicLink: () => void;
    setOAuthLoading: (provider: "google" | "github" | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    magicLinkSent: false,
    magicLinkEmail: "",
    oauthLoading: null,

    setMagicLinkSent: (email) => set({ magicLinkSent: true, magicLinkEmail: email }),
    resetMagicLink: () => set({ magicLinkSent: false, magicLinkEmail: "" }),
    setOAuthLoading: (provider) => set({ oauthLoading: provider }),
}));
