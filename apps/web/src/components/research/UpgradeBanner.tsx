import Link from "next/link";

export const RESEARCH_SUMMARY_NOTE =
  "This is a summary of published research by UseFrame. Please read the original paper for full details.";

export function UpgradeBanner({ planName }: { planName: string | null }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3.5 text-[13px] text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
      <p className="font-semibold">
        Unlock the full research library with the {planName ?? "top"} plan.{" "}
        <Link href="/pricing" className="underline underline-offset-2 hover:no-underline">
          See plans
        </Link>
      </p>
      <p className="text-[12.5px] opacity-90">
        Findings cited in your own projects are always open, in your project&apos;s Research tab.
      </p>
    </div>
  );
}
