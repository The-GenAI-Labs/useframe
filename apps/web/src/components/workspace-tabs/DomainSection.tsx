"use client"

import { useCallback, useEffect, useState } from "react"
import { domainsApi, type CustomDomain } from "@/lib/api/services/domains.service"

type Props = {
    slug: string
}

const STATUS_LABEL: Record<CustomDomain["status"], string> = {
    PENDING: "Pending",
    VERIFYING: "Verifying…",
    ACTIVE: "Active, SSL issued",
    FAILED: "Failed",
}

export function DomainSection({ slug }: Props) {
    const [customDomain, setCustomDomain] = useState<CustomDomain | null | undefined>(undefined)
    const [input, setInput] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    const load = useCallback(() => {
        domainsApi
            .get(slug)
            .then(({ customDomain }) => setCustomDomain(customDomain))
            .catch(() => setCustomDomain(null))
    }, [slug])

    useEffect(() => {
        load()
    }, [load])

    // Once a domain is added and not yet ACTIVE, poll for verification status.
    useEffect(() => {
        if (!customDomain || customDomain.status === "ACTIVE") return
        const interval = setInterval(load, 5000)
        return () => clearInterval(interval)
    }, [customDomain, load])

    const handleAdd = useCallback(() => {
        if (!input.trim()) return
        setSubmitting(true)
        setError(null)
        domainsApi
            .add(slug, input.trim())
            .then(({ customDomain }) => {
                setCustomDomain(customDomain)
                setInput("")
            })
            .catch((err) => {
                setError(err instanceof Error ? err.message : "Couldn't add domain")
            })
            .finally(() => setSubmitting(false))
    }, [slug, input])

    const handleCopy = useCallback(() => {
        if (!customDomain?.cnameTarget) return
        navigator.clipboard.writeText(customDomain.cnameTarget).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        })
    }, [customDomain])

    if (customDomain === undefined) return null

    return (
        <div className="flex flex-col gap-2.5 mt-4 p-4 rounded-2xl border border-base bg-surface w-full max-w-sm text-left">
            <p className="text-[12px] font-semibold text-pri">Custom domain</p>

            {!customDomain ? (
                <>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && !submitting && handleAdd()}
                            placeholder="acme.com"
                            className="flex-1 px-3 py-2 rounded-xl border border-base bg-tertiary text-[12.5px] text-sec placeholder:text-mut outline-none"
                            disabled={submitting}
                        />
                        <button
                            type="button"
                            onClick={handleAdd}
                            disabled={submitting || !input.trim()}
                            className="px-3.5 py-2 rounded-xl text-[12px] font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? "Adding…" : "Add"}
                        </button>
                    </div>
                    {error && <p className="text-[11px] text-red-500">{error}</p>}
                </>
            ) : (
                <div className="flex flex-col gap-1.5">
                    <p className="text-[12.5px] font-medium text-sec">{customDomain.domain}</p>
                    <div className="flex items-center gap-1.5">
                        <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg ${
                                customDomain.status === "ACTIVE"
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                                    : "bg-tertiary text-mut"
                            }`}
                        >
                            {STATUS_LABEL[customDomain.status]}
                        </span>
                    </div>
                    {customDomain.status !== "ACTIVE" && customDomain.cnameTarget && (
                        <div className="flex items-center gap-1.5 mt-1">
                            <p className="text-[11px] text-mut">
                                Point a CNAME record to{" "}
                                <span className="font-mono text-sec">{customDomain.cnameTarget}</span>
                            </p>
                            <button
                                type="button"
                                onClick={handleCopy}
                                className="text-[10px] font-medium text-blue-500 hover:text-blue-600 cursor-pointer shrink-0"
                            >
                                {copied ? "Copied" : "Copy"}
                            </button>
                        </div>
                    )}
                    {customDomain.failureReason && (
                        <p className="text-[11px] text-red-500">{customDomain.failureReason}</p>
                    )}
                </div>
            )}
        </div>
    )
}
