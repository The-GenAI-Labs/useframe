"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { signInWithEmail } from "@/lib/auth-actions"
import { Mail } from "lucide-react"
import { z } from "zod"

const emailSchema = z.string().email("Invalid email address")

export const MagicLinkForm = () => {
    const [email, setEmail] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [sent, setSent] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")

        const result = emailSchema.safeParse(email)
        if (!result.success) {
            setError(result.error.errors[0].message)
            return
        }

        setLoading(true)
        try {
            const res = await signInWithEmail(email)
            if (res.success) {
                setSent(true)
            } else {
                setError(res.error ?? "Something went wrong")
            }
        } finally {
            setLoading(false)
        }
    }

    if (sent) {
        return (
            <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-blue-500" />
                </div>
                <p className="text-sm font-medium text-gray-700">Check your email</p>
                <p className="text-xs text-zinc-400 text-center">
                    We sent a magic link to <span className="font-medium text-zinc-600">{email}</span>
                </p>
            </div>
        )
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                <Input
                    type="email"
                    placeholder="john.doe@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 h-11 text-gray-600 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-blue-300"
                />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-blue-100 hover:bg-blue-200 text-blue-600 font-medium border-0 shadow-none cursor-pointer focus-visible:ring-0"
                variant="outline"
            >
                {loading ? "Sending link..." : "Continue with email"}
            </Button>
        </form>
    )
}