import AuthLayout from "@/components/auth/AuthLayout";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = {
  ...pageMetadata(
    "Account Access",
    "Sign in securely to manage your websites and projects in useframe.",
  ),
  referrer: "no-referrer",
};

export default function AuthLogin({ children }: { children: React.ReactNode }) {
  return <AuthLayout>{children}</AuthLayout>;
}
