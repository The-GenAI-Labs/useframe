import Link from "next/link";

export const metadata = {
    title: "Terms of Service — UseFrame",
};

// DRAFT — placeholder copy only. This has NOT been reviewed by legal and
// must not be treated as a final Terms of Service before launch. It exists
// so the signup flow has something real to link to and so
// acceptedTermsVersion has a version string ("2026-09-v1", see
// TERMS_VERSION in apps/server/src/modules/auth/auth.service.ts) to point
// at. Bump that version string whenever this page is materially revised.
export default function TermsPage() {
    return (
        <div className="mx-auto max-w-2xl px-6 py-16">
            <div className="mb-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Draft — this page has not been reviewed by legal counsel. Do not
                treat it as final before launch.
            </div>

            <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">
                Terms of Service
            </h1>
            <p className="mb-10 text-sm text-slate-500">
                Version 2026-09-v1 · Last updated September 2026
            </p>

            <div className="space-y-8 text-[15px] leading-relaxed text-slate-700">
                <section>
                    <h2 className="mb-2 text-lg font-semibold text-slate-900">1. Acceptance of terms</h2>
                    <p>
                        By creating an account or using UseFrame, you agree to these
                        Terms of Service and our{" "}
                        <Link href="/privacy" className="underline hover:text-slate-900">
                            Privacy Policy
                        </Link>
                        . If you do not agree, do not use the service.
                    </p>
                </section>

                <section>
                    <h2 className="mb-2 text-lg font-semibold text-slate-900">2. Your account</h2>
                    <p>
                        You&apos;re responsible for the content you generate and for
                        keeping your account credentials secure. We may suspend or
                        terminate accounts that violate these terms or applicable law.
                    </p>
                </section>

                <section>
                    <h2 className="mb-2 text-lg font-semibold text-slate-900">3. Generated content</h2>
                    <p>
                        UseFrame helps you generate websites and related content using
                        AI. You retain ownership of the sites you create, subject to
                        any third-party rights in material you supply. We do not claim
                        ownership of your generated projects.
                    </p>
                </section>

                <section>
                    <h2 className="mb-2 text-lg font-semibold text-slate-900">4. Public showcase</h2>
                    <p>
                        Submitting a project to the public UseFrame showcase gallery is
                        always a separate, opt-in action from creating an account —
                        agreeing to these Terms does not enroll any project in the
                        showcase.
                    </p>
                </section>

                <section>
                    <h2 className="mb-2 text-lg font-semibold text-slate-900">5. Acceptable use</h2>
                    <p>
                        Don&apos;t use UseFrame to generate unlawful, deceptive, or
                        infringing content, and don&apos;t attempt to circumvent our
                        bot-verification, rate-limiting, or abuse-prevention systems.
                    </p>
                </section>

                <section>
                    <h2 className="mb-2 text-lg font-semibold text-slate-900">6. Changes to these terms</h2>
                    <p>
                        We may update these terms from time to time. Material changes
                        will bump the version shown at the top of this page, and we
                        record which version each account most recently accepted.
                    </p>
                </section>

                <section>
                    <h2 className="mb-2 text-lg font-semibold text-slate-900">7. Contact</h2>
                    <p>
                        Questions about these terms? Reach us at{" "}
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
