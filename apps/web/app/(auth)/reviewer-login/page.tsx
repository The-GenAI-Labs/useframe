import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import ReviewerLoginForm from "@/components/auth/ReviewerLoginForm";

const API_SERVICE_URL = process.env.NEXT_PUBLIC_API_SERVICE_URL ?? "http://localhost:4000";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...pageMetadata("Reviewer Sign In", "Sign in to the payment review account."),
  referrer: "no-referrer",
};

async function reviewerLoginEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${API_SERVICE_URL}/api/auth/reviewer-login`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return res.status === 204;
  } catch {
    return false;
  }
}

export default async function ReviewerLoginPage() {
  if (!(await reviewerLoginEnabled())) notFound();
  return <ReviewerLoginForm />;
}
