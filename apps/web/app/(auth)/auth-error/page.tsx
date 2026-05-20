import Link from "next/link"
import { Button } from "@/components/ui/button"

const errorMessages: Record<string, string> = {
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
}

const AuthError = ({
    searchParams,
}: {
    searchParams: { error?: string }
}) => {
    const message =
        errorMessages[searchParams.error ?? "Default"] ??
        errorMessages.Default

    return (
        <div className="w-full max-w-[380px] mx-auto flex flex-col items-center gap-6 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-2xl">
                ⚠️
            </div>
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-gray-800">
                    Authentication Error
                </h1>
                <p className="text-sm text-zinc-500">{message}</p>
            </div>
            <Button
                asChild
                variant="outline"
                className="cursor-pointer focus-visible:ring-0"
            >
                <Link href="/login">Back to sign in</Link>
            </Button>
        </div>
    )
}

export default AuthError