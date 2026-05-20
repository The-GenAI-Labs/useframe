"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Mail, Lock, User } from "lucide-react"
import { useRouter } from "next/navigation"

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Min 8 characters"),
})

const signupSchema = z.object({
  name: z.string().min(2, "Min 2 characters"),
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Min 8 characters"),
})

type LoginValues = z.infer<typeof loginSchema>
type SignupValues = z.infer<typeof signupSchema>

interface AuthFormProps {
  mode: "login" | "signup"
}

const AuthForm = ({ mode }: AuthFormProps) => {
  const isLogin = mode === "login"
  const router = useRouter()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues | SignupValues>({
    resolver: zodResolver(isLogin ? loginSchema : signupSchema),
  })

  const onSubmit = (values: LoginValues | SignupValues) => {
    console.log(values)
  }

  return (
    <div className="w-full max-w-[380px] mx-auto flex flex-col gap-5">

      {/* logo */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-rose-500 rounded-lg" />
        <span className="font-semibold text-gray-700 text-lg">UseFrame</span>
      </div>

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
        <Button
          type="button"
          variant="outline"
          className="w-full h-11 text-gray-700 cursor-pointer focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          <svg className="w-4 h-4 mr-2 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continue with Google
        </Button>

        <Button
          type="button"
          variant="outline"
          className="w-full h-11 text-gray-700 cursor-pointer focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          <svg className="w-4 h-4 mr-2 shrink-0" viewBox="0 0 24 24">
            <path fill="#F25022" d="M1 1h10v10H1z" />
            <path fill="#7FBA00" d="M13 1h10v10H13z" />
            <path fill="#00A4EF" d="M1 13h10v10H1z" />
            <path fill="#FFB900" d="M13 13h10v10H13z" />
          </svg>
          Continue with GitHub
        </Button>
      </div>

      {/* divider */}
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-zinc-400">Or</span>
        <Separator className="flex-1" />
      </div>

      {/* form */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">

        {/* name — signup only */}
        {!isLogin && (
          <div className="flex flex-col gap-1">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              <Input
                placeholder="Full name"
                className="pl-9 h-11 text-gray-600 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-zinc-300"
                {...register("name")}
              />
            </div>
            {"name" in errors && errors.name && (
              <p className="text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>
        )}

        {/* email */}
        <div className="flex flex-col gap-1">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <Input
              type="email"
              placeholder="john.doe@email.com"
              className="pl-9 h-11 text-gray-600 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-zinc-300"
              {...register("email")}
            />
          </div>
          {errors.email && (
            <p className="text-xs text-red-500">{errors.email.message}</p>
          )}
        </div>

        {/* password */}
        <div className="flex flex-col gap-1">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <Input
              type="password"
              placeholder="Password"
              className="pl-9 h-11 text-gray-600 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-zinc-300"
              {...register("password")}
            />
          </div>
          {errors.password && (
            <p className="text-xs text-red-500">{errors.password.message}</p>
          )}
          {isLogin && (
            <div className="flex justify-end mt-1">
              <Link
                href="/forgot-password"
                className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer"
              >
                Forgot password?
              </Link>
            </div>
          )}
        </div>

        {/* submit */}
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-11 mt-1 bg-orange-100 hover:bg-orange-200 text-orange-600 font-medium border-0 shadow-none cursor-pointer focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          variant="outline"
        >
          {isSubmitting ? "Please wait..." : isLogin ? "Sign in" : "Continue with email"}
        </Button>

      </form>

      {/* bottom link */}
      <p className="text-center text-sm text-zinc-500">
        {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => router.push(isLogin ? "/signup" : "/login")}
          className="text-orange-500 hover:text-orange-600 font-medium cursor-pointer transition-colors"
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