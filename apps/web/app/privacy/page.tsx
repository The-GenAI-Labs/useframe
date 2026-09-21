export const metadata = {
    title: "Privacy Policy — UseFrame",
};

// DRAFT — placeholder copy only. This has NOT been reviewed by legal and
// must not be treated as a final Privacy Policy before launch.
export default function PrivacyPage() {
    return (
        <div className="mx-auto max-w-2xl px-6 py-16">
            <div className="mb-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Draft — this page has not been reviewed by legal counsel. Do not
                treat it as final before launch.
            </div>

            <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">
                Privacy Policy
            </h1>
            <p className="mb-10 text-sm text-slate-500">
                Version 2026-09-v1 · Last updated September 2026
            </p>

            <div className="space-y-8 text-[15px] leading-relaxed text-slate-700">
                <section>
                    <h2 className="mb-2 text-lg font-semibold text-slate-900">1. What we collect</h2>
                    <p>
                        Account details (name, email, avatar from your sign-in
                        provider), the projects and content you create, and basic
                        usage data. If you arrive via a referral or campaign link, we
                        record the referral source and UTM parameters against your
                        account at signup.
                    </p>
                </section>

                <section>
                    <h2 className="mb-2 text-lg font-semibold text-slate-900">2. Bot verification</h2>
                    <p>
                        We use Cloudflare Turnstile to verify that sign-in requests
                        come from a real browser rather than an automated script. This
                        may share limited network signals with Cloudflare; it does not
                        involve the visible puzzles older CAPTCHAs used.
                    </p>
                </section>

                <section>
                    <h2 className="mb-2 text-lg font-semibold text-slate-900">3. How we use your data</h2>
                    <p>
                        To operate and improve UseFrame, to communicate with you about
                        your account, and to understand which channels bring people to
                        the product. We do not sell your personal data.
                    </p>
                </section>

                <section>
                    <h2 className="mb-2 text-lg font-semibold text-slate-900">4. Public showcase</h2>
                    <p>
                        A project only becomes publicly visible in the UseFrame
                        showcase gallery if you explicitly opt it in and it passes
                        manual review. This is a separate, per-project decision from
                        anything in this policy.
                    </p>
                </section>

                <section>
                    <h2 className="mb-2 text-lg font-semibold text-slate-900">5. Data retention & deletion</h2>
                    <p>
                        You can request deletion of your account and associated data
                        at any time by contacting us.
                    </p>
                </section>

                <section>
                    <h2 className="mb-2 text-lg font-semibold text-slate-900">6. Contact</h2>
                    <p>
                        Questions about this policy? Reach us at{" "}
                        <a href="mailto:hello@useframe.in" className="underline hover:text-slate-900">
                            hello@useframe.in
                        </a>
                        .
                    </p>
                </section>
            </div>
        </div>
    );
}
