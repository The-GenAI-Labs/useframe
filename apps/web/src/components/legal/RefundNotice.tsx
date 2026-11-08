import Link from "next/link";

const linkClass =
  "rounded-sm underline underline-offset-2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

export function RefundNotice({ className = "" }: { className?: string }) {
  return (
    <p className={className}>
      One-time credit purchase. No refunds. See our{" "}
      <Link href="/refund-policy" className={linkClass}>
        Refund Policy
      </Link>{" "}
      and{" "}
      <Link href="/terms" className={linkClass}>
        Terms
      </Link>
      .
    </p>
  );
}
