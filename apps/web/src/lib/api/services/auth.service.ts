import type { SendMagicLinkPayload, SendMagicLinkResponse } from "../types";
import { signInWithEmail, signInWithGoogle, signInWithGitHub } from "@/lib/auth-actions";

// magic link goes through Next Auth server action directly — no axios needed
// because it creates a DB token via PrismaAdapter and sends the email via Resend
export async function sendMagicLink(payload: SendMagicLinkPayload): Promise<SendMagicLinkResponse> {
    const result = await signInWithEmail(payload.email);
    if (!result.success) {
        throw new Error(result.error ?? "Failed to send magic link");
    }
    return { success: true };
}

// OAuth initiates a provider redirect — must stay as server actions
export { signInWithGoogle, signInWithGitHub };
