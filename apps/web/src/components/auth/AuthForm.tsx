"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { Separator } from "@/components/ui/separator"
import { OAuthButton } from "@/components/auth/OAuthButton"
import { MagicLinkForm } from "@/components/auth/MagicLinkForm"

interface AuthFormProps {
  mode: "login" | "signup"
}

const AuthForm = ({ mode }: AuthFormProps) => {
  const isLogin = mode === "login"
  const router = useRouter()

  return (
    <div className="w-full max-w-[380px] mx-auto flex flex-col gap-5">

      {/* heading */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl text-gray-800 font-bold tracking-tight">
          {isLogin ? "Welcome back" : "Create an account"}
        </h1>
        <p className="text-sm text-zinc-500">
          {isLogin
            ? "Sign in to continue to UseFrame."
            : "Start building pages backed by science."}
        </p>
      </div>

      {/* oauth */}
      <div className="flex flex-col gap-3">
        <OAuthButton provider="google" />
        <OAuthButton provider="github" />
      </div>

      {/* divider */}
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-zinc-400">Or</span>
        <Separator className="flex-1" />
      </div>

      {/* magic link form */}
      <MagicLinkForm />

      {/* bottom link */}
      <p className="text-center text-sm text-zinc-500">
        {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => router.push(isLogin ? "/signup" : "/login")}
          className="text-blue-500 hover:text-blue-600 font-medium cursor-pointer transition-colors"
        >
          {isLogin ? "Sign up" : "Sign in"}
        </button>
      </p>

      {!isLogin && (
        <p className="text-center text-xs text-zinc-400 -mt-2">
          By signing up, you agree to our{" "}
          <Link href="/terms" className="underline hover:text-zinc-600 cursor-pointer transition-colors">
            Terms of service
          </Link>{" "}
          &{" "}
          <Link href="/privacy" className="underline hover:text-zinc-600 cursor-pointer transition-colors">
            Privacy policy
          </Link>
        </p>
      )}

    </div>
  )
}

export default AuthForm