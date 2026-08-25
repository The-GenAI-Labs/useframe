"use server";

import { signIn, signOut } from "@/lib/auth";
import { prisma } from "@useframe/db";
import { AuthError } from "next-auth";

export async function checkUserExists(email: string): Promise<boolean> {
    try {
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });
        return !!user;
    } catch (error) {
        console.error("checkUserExists failed:", error);
        return false;
    }
}

export async function signInWithGoogle() {
    await signIn("google", { redirectTo: "/" });
}

export async function signInWithGitHub() {
    await signIn("github", { redirectTo: "/" });
}

export async function signInWithEmail(email: string) {
    try {
        await signIn("resend", {
            email,
            redirectTo: "/",
            redirect: false,
        });
        return { success: true };
    } catch (error) {
        if (error instanceof AuthError) {
            return { success: false, error: error.message };
        }
        return { success: false, error: "Something went wrong" };
    }
}

export async function signOutUser() {
    await signOut({ redirectTo: "/signin" });
}
