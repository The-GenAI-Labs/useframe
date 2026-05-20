"use server"

import { signIn, signOut } from "@/lib/auth"
import { AuthError } from "next-auth"

export async function signInWithGoogle() {
    await signIn("google", { redirectTo: "/dashboard" })
}

export async function signInWithGitHub() {
    await signIn("github", { redirectTo: "/dashboard" })
}

export async function signInWithEmail(email: string) {
    try {
        await signIn("resend", {
            email,
            redirectTo: "/dashboard",
            redirect: false,
        })
        return { success: true }
    } catch (error) {
        if (error instanceof AuthError) {
            return { success: false, error: error.message }
        }
        return { success: false, error: "Something went wrong" }
    }
}

export async function signOutUser() {
    await signOut({ redirectTo: "/login" })
}