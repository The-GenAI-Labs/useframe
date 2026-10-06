import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata(
  "Sign In",
  "Sign in to useframe to build websites, explore design research, and manage your projects.",
);

import { Suspense } from "react";
import AuthForm from "@/components/auth/AuthForm";

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm />
    </Suspense>
  );
}
