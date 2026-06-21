import Link from "next/link";
import { Button } from "@/components/ui/button";

const ERROR_MESSAGES: Record<string, string> = {
    OAuthSignin: "Error starting OAuth sign in.",
    OAuthCallback: "Error during OAuth callback.",
    OAuthCreateAccount: "Could not create OAuth account.",
    EmailCreateAccount: "Could not create email account.",
    Callback: "Error during callback.",
    OAuthAccountNotLinked: "This email is already linked to another provider.",
    EmailSignin: "Error sending the magic link email.",
    CredentialsSignin: "Invalid credentials.",
    SessionRequired: "Please sign in to access this page.",
    Default: "Something went wrong. Please try again.",
};

interface AuthErrorPageProps {
    searchParams: Promise<{ error?: string }>;
}

const AuthError = async ({ searchParams }: AuthErrorPageProps) => {
    const { error } = await searchParams;
    const message = ERROR_MESSAGES[error ?? "Default"] ?? ERROR_MESSAGES.Default;

    return (
        <div className="w-full max-w-[380px] mx-auto flex flex-col items-center gap-6 text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-red-400">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
            </div>
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-gray-800">Authentication Error</h1>
                <p className="text-sm text-zinc-500">{message}</p>
            </div>
            <Button
                asChild
                variant="outline"
                className="cursor-pointer focus-visible:ring-0 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
                <Link href="/signin">Back to sign in</Link>
            </Button>
        </div>
    );
};

export default AuthError;
