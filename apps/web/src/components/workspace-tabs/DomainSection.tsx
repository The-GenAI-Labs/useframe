"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { domainsApi, type CustomDomain, type DnsRecord } from "@/lib/api/services/domains.service"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const CHECK_COOLDOWN_MS = 10_000
const SETTLED = new Set(["ACTIVE", "FAILED"])

const primaryButton =
  "px-4 py-2 rounded-xl text-[12.5px] font-semibold transition-all cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
const secondaryButton =
  "px-3 py-1.5 rounded-xl border border-base text-[12px] font-medium text-sec hover:border-em hover:bg-tertiary transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"

// Client-side hint only; the server decides with a public-suffix list after submit.
function looksLikeApex(input: string): boolean {
  const host = input.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] ?? ""
  if (!host || host.startsWith("www.")) return false
  const labels = host.split(".").filter(Boolean)
  return labels.length === 2 || (labels.length === 3 && /^(co|com|org|net|ac|gov)$/.test(labels[1] ?? ""))
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center justify-between gap-2">
      <code className="min-w-0 break-all font-mono text-[11.5px] text-pri">{value}</code>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        className={secondaryButton}
        onClick={() =>
          navigator.clipboard.writeText(value).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  )
}

function RecordTable({ record }: { record: DnsRecord }) {
  return (
    <dl className="grid gap-2 rounded-xl border border-base p-3 text-[11.5px]">
      <div>
        <dt className="text-mut">Type</dt>
        <dd className="font-mono text-pri">{record.type}</dd>
      </div>
      <div>
        <dt className="text-mut">Name (if your DNS host adds the domain for you)</dt>
        <dd>
          <CopyValue value={record.relativeName} label={`${record.type} relative name`} />
        </dd>
      </div>
      <div>
        <dt className="text-mut">Full name</dt>
        <dd>
          <CopyValue value={record.name} label={`${record.type} full name`} />
        </dd>
      </div>
      <div>
        <dt className="text-mut">Value</dt>
        <dd>
          <CopyValue value={record.value} label={`${record.type} value`} />
        </dd>
      </div>
    </dl>
  )
}

const STEP_STATE: Record<string, string> = {
  pending: "Waiting for the record",
  found: "Record found ✓",
  wrong_value: "Found a record with a different value — check it matches exactly",
  done: "Done ✓",
  waiting: "Do this after Step 1 shows ✓",
}

function Stepper({ domain }: { domain: CustomDomain }) {
  const [ownership, routing] = domain.steps
  const live = domain.status === "ACTIVE"
  const certificateStep = live
    ? "Done ✓"
    : routing.state === "waiting"
      ? "Automatic, after Step 2"
      : domain.certificate.status
        ? `Certificate: ${domain.certificate.status.replace(/_/g, " ")}`
        : "Automatic once your CNAME resolves"

  return (
    <ol className="flex flex-col gap-4">
      <li className="flex flex-col gap-2">
        <p className="text-[12.5px] font-semibold text-pri">Step 1 — Verify ownership (TXT)</p>
        <p className="text-[11.5px] text-mut">{STEP_STATE[ownership.state]}</p>
        {ownership.state !== "done" && <RecordTable record={ownership.record} />}
        {ownership.state === "wrong_value" && domain.currentDns.txtFound.length > 0 && (
          <p className="text-[11px] text-amber-600">We found: {domain.currentDns.txtFound.join(", ")}</p>
        )}
      </li>
      <li className="flex flex-col gap-2">
        <p className="text-[12.5px] font-semibold text-pri">Step 2 — Point your domain (CNAME)</p>
        <p className="text-[11.5px] text-mut">{STEP_STATE[routing.state]}</p>
        {!live && <RecordTable record={routing.record} />}
        {!live && routing.state !== "waiting" && domain.currentDns.resolvesTo.length > 0 && (
          <p className="text-[11px] text-mut">
            Currently points to {domain.currentDns.resolvesTo.join(", ")} — expected {routing.record.value}
          </p>
        )}
      </li>
      <li className="flex flex-col gap-1">
        <p className="text-[12.5px] font-semibold text-pri">Step 3 — Secure &amp; go live (automatic)</p>
        <p className="text-[11.5px] text-mut">{certificateStep}</p>
        {domain.certificate.hint && <p className="text-[11px] text-amber-600">{domain.certificate.hint}</p>}
      </li>
    </ol>
  )
}

export function DomainSection({ slug, defaultHost }: { slug: string; defaultHost?: string }) {
  const queryClient = useQueryClient()
  const [input, setInput] = useState("")
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  const query = useQuery({
    queryKey: ["domain", slug],
    queryFn: () => domainsApi.get(slug),
    refetchInterval: (q) => {
      const domain = q.state.data?.domain
      return domain && !SETTLED.has(domain.status) ? 5000 : false
    },
  })

  useEffect(() => {
    if (cooldownUntil <= now) return
    const timer = setTimeout(() => setNow(Date.now()), cooldownUntil - now)
    return () => clearTimeout(timer)
  }, [cooldownUntil, now])

  const setDomain = (domain: CustomDomain | null) =>
    queryClient.setQueryData(["domain", slug], { enabled: true, domain })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["domain", slug] })

  const add = useMutation({ mutationFn: (hostname: string) => domainsApi.add(slug, hostname), onSuccess: setDomain })
  const check = useMutation({
    mutationFn: (id: string) => domainsApi.check(slug, id),
    onMutate: () => {
      setCooldownUntil(Date.now() + CHECK_COOLDOWN_MS)
      setNow(Date.now())
    },
    onSuccess: setDomain,
  })
  const retry = useMutation({ mutationFn: (id: string) => domainsApi.retry(slug, id), onSuccess: setDomain })
  const remove = useMutation({ mutationFn: (id: string) => domainsApi.remove(slug, id), onSettled: refresh })

  // The site's primary URL changes when a domain goes live or is removed.
  const status = query.data?.domain?.status ?? null
  const routingPhase = status === "ACTIVE" ? "active" : status === null ? "none" : "other"
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["deploy-site", slug] })
    queryClient.invalidateQueries({ queryKey: ["deployments", slug] })
  }, [routingPhase, queryClient, slug])

  if (!query.data?.enabled) return null
  const domain = query.data.domain
  const error = [add.error, check.error, retry.error, remove.error].find((e) => e instanceof Error) as Error | undefined

  return (
    <section aria-label="Custom domain" className="flex flex-col gap-3">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-mut">Custom domain</h3>

      {!domain && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (input.trim()) add.mutate(input.trim())
          }}
        >
          <label htmlFor="custom-domain" className="text-[12px] text-sec">
            Domain you own
          </label>
          <div className="flex gap-2">
            <input
              id="custom-domain"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="www.example.com"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-xl border border-base bg-transparent px-3 py-2 text-[12.5px] text-pri focus-visible:outline-2 focus-visible:outline-indigo-500"
            />
            <button
              type="submit"
              disabled={add.isPending || !input.trim()}
              className={primaryButton}
              style={{ backgroundColor: "var(--text-primary)", color: "var(--bg-primary)" }}
            >
              {add.isPending ? "Connecting…" : "Connect"}
            </button>
          </div>
          {looksLikeApex(input) && (
            <p className="text-[11.5px] text-amber-600">
              We recommend connecting www.{input.trim().replace(/^https?:\/\//, "")} and forwarding the bare domain to
              it at your registrar. You can still continue with the bare domain.
            </p>
          )}
        </form>
      )}

      {domain && domain.status !== "ACTIVE" && domain.status !== "FAILED" && domain.status !== "REMOVING" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-base p-4">
          <p className="text-[13px] font-semibold text-pri break-all">{domain.hostname}</p>
          <Stepper domain={domain} />
          {domain.apexAdvice && <p className="text-[11.5px] text-mut">{domain.apexAdvice}</p>}
          <ul className="list-disc pl-4 text-[11px] text-mut">
            {domain.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={secondaryButton}
              disabled={check.isPending || now < cooldownUntil}
              onClick={() => check.mutate(domain.id)}
            >
              {check.isPending ? "Checking…" : "Check now"}
            </button>
            <button type="button" className={secondaryButton} onClick={() => setConfirmRemove(true)}>
              Cancel
            </button>
            {domain.lastCheckedAt && (
              <span className="text-[11px] text-mut">
                Last checked {new Date(domain.lastCheckedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      )}

      {domain?.status === "ACTIVE" && (
        <div className="flex flex-col gap-2 rounded-2xl border border-base p-4">
          {domain.warning && (
            <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-[11.5px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              {domain.warning}
            </p>
          )}
          <p className="text-[12px] font-semibold text-emerald-600">Connected</p>
          <a
            href={`https://${domain.hostname}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12.5px] text-indigo-500 hover:underline break-all"
          >
            https://{domain.hostname}
          </a>
          <p className="text-[11.5px] text-mut">
            {defaultHost ? `${defaultHost} now redirects here.` : "Your useframe address now redirects here."}
          </p>
          <div className="flex gap-2">
            <a href={`https://${domain.hostname}`} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
              Visit
            </a>
            <button type="button" className={secondaryButton} onClick={() => setConfirmRemove(true)}>
              Remove domain
            </button>
          </div>
        </div>
      )}

      {domain?.status === "FAILED" && (
        <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-base p-4">
          <p className="text-[12.5px] font-semibold text-pri break-all">{domain.hostname}</p>
          <p className="text-[12px] text-red-600">{domain.failureReason}</p>
          <div className="flex gap-2">
            {domain.retryable && (
              <button type="button" className={secondaryButton} disabled={retry.isPending} onClick={() => retry.mutate(domain.id)}>
                Retry
              </button>
            )}
            <button type="button" className={secondaryButton} onClick={() => setConfirmRemove(true)}>
              Remove
            </button>
          </div>
        </div>
      )}

      {domain?.status === "REMOVING" && <p className="text-[12px] text-mut">Removing {domain.hostname}…</p>}

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error.message}
        </p>
      )}

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {domain?.hostname}?</DialogTitle>
            <DialogDescription>
              Your site goes back to its useframe.in address. Afterwards, delete the TXT and CNAME records for this
              domain at your registrar or DNS host.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" className={secondaryButton} onClick={() => setConfirmRemove(false)}>
              Keep domain
            </button>
            <button
              type="button"
              className={primaryButton}
              style={{ backgroundColor: "var(--text-primary)", color: "var(--bg-primary)" }}
              onClick={() => {
                if (domain) remove.mutate(domain.id)
                setConfirmRemove(false)
              }}
            >
              Remove
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
