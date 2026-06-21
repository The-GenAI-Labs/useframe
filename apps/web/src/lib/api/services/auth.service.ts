import type { SendMagicLinkPayload, SendMagicLinkResponse } from "../types";
import { signInWithEmail, signInWithGoogle, signInWithGitHub } from "@/lib/auth-actions";

export async function sendMagicLink(payload: SendMagicLinkPayload): Promise<SendMagicLinkResponse> {
    const result = await signInWithEmail(payload.email);
    if (!result.success) {
        throw new Error(result.error ?? "Failed to send magic link");
    }
    return { success: true };
}

export { signInWithGoogle, signInWithGitHub };
