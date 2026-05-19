"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form"
import { Mail, Lock, User } from "lucide-react"

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

type LoginValues = z.infer<typeof loginSchema>
type SignupValues = z.infer<typeof signupSchema>


interface AuthFormProps {
  mode: "login" | "signup"
}

const AuthForm = ({ mode }: AuthFormProps) => {
  const isLogin = mode === "login"

  const form = useForm<LoginValues | SignupValues>({
    resolver: zodResolver(isLogin ? loginSchema : signupSchema),
    defaultValues: isLogin
      ? { email: "", password: "" }
      : { name: "", email: "", password: "" },
  })

  const onSubmit = (values: LoginValues | SignupValues) => {
    console.log(values)
  }

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col gap-6">

      {/* logo */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-gradient-to-br from-orange-400 to-rose-500 rounded-md" />
        <span className="font-semibold text-zinc-800 dark:text-zinc-100 text-lg">
          UseFrame
        </span>
      </div>

      {/* heading */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
          {isLogin ? "Welcome back" : "Create an account"}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
          {isLogin
            ? "UseFrame is a fast, simple way to build science-driven landing pages."
            : "Start building landing pages backed by research, not instinct."}
        </p>
      </div>

      {/* oauth buttons */}
      <div className="flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          className="w-full h-11 font-medium text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700"
        >
          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
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
          className="w-full h-11 font-medium text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700"
        >
          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
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
        <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">Or</span>
        <Separator className="flex-1" />
      </div>

      {/* form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">

          {/* name — signup only */}
          {!isLogin && (
            <FormField
              control={form.control}
              name="name"
              render={({ field }: any) => (
                <FormItem>
                  <FormControl>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <Input
                        placeholder="Full name"
                        className="pl-9 h-11"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* email */}
          <FormField
            control={form.control}
            name="email"
            render={({ field }: any) => (
              <FormItem>
                <FormControl>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <Input
                      type="email"
                      placeholder="john.doe@email.com"
                      className="pl-9 h-11"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* password */}
          <FormField
            control={form.control}
            name="password"
            render={({ field }: any) => (
              <FormItem>
                <FormControl>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <Input
                      type="password"
                      placeholder="Password"
                      className="pl-9 h-11"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
                {/* forgot password — login only */}
                {isLogin && (
                  <div className="flex justify-end">
                    <Link
                      href="/forgot-password"
                      className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>
                )}
              </FormItem>
            )}
          />

          {/* submit */}
          <Button
            type="submit"
            className="w-full h-11 bg-orange-100 hover:bg-orange-200 text-orange-700
                       dark:bg-orange-900/30 dark:hover:bg-orange-900/50 dark:text-orange-300
                       font-medium border-0 shadow-none"
            variant="outline"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting
              ? "Please wait..."
              : isLogin ? "Sign in" : "Continue with email"}
          </Button>

        </form>
      </Form>

      {/* bottom link */}
      <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
        {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
        <Link
          href={isLogin ? "/signup" : "/login"}
          className="text-orange-500 hover:text-orange-600 font-medium transition-colors"
        >
          {isLogin ? "Sign up" : "Sign in"}
        </Link>
      </p>

      {/* terms — signup only */}
      {!isLogin && (
        <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 -mt-2">
          By signing up, you agree to our{" "}
          <Link href="/terms" className="underline hover:text-zinc-600 transition-colors">
            Terms of service
          </Link>{" "}
          &{" "}
          <Link href="/privacy" className="underline hover:text-zinc-600 transition-colors">
            Privacy policy
          </Link>
        </p>
      )}

    </div>
  )
}

export default AuthForm