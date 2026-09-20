"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ProjectForm } from "./ProjectForm"
import { projectsApi } from "@/lib/api/services/projects.service"
import { useProjectStore } from "@/stores/projectStore"
import { useProjectModalStore } from "@/store/projectModalStore"
import type { CreateProjectInput, ProjectInputType } from "@repo/schemas"

type SiteType = CreateProjectInput["siteType"]

const SITE_TYPES: { value: SiteType; label: string }[] = [
  { value: "SINGLE_PAGE", label: "Single page" },
  { value: "MULTI_PAGE", label: "Multi page" },
  { value: undefined, label: "Let AI decide" },
]

const ENTRY_OPTIONS: { value: ProjectInputType; label: string }[] = [
  { value: "FROM_SCRATCH", label: "From idea" },
  { value: "FROM_OWN_SITE", label: "Redesign my site" },
]

const STATS = [
  { value: "100,000+", label: "Pages generated" },
  { value: "120+", label: "Research-backed rules" },
  { value: "4.8/5", label: "Rated by builders" },
]

export function CreateProjectModal() {
  const router = useRouter()
  const { isOpen, close } = useProjectModalStore()
  const [step, setStep] = useState<1 | 2>(1)
  const [inputType, setInputType] = useState<ProjectInputType>("FROM_SCRATCH")
  const [name, setName] = useState("")
  const [siteType, setSiteType] = useState<SiteType>(undefined)
  // Set once the project row exists; swaps the modal to the "start generation?"
  // confirmation instead of navigating away immediately.
  const [createdSlug, setCreatedSlug] = useState<string | null>(null)
  const { setProject } = useProjectStore()

  const createMutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: (result) => {
      setProject(result.project, result.version)
      setCreatedSlug(result.project.slug)
    },
  })

  const handleSubmit = async (data: CreateProjectInput) => {
    await createMutation.mutateAsync({ ...data, inputType })
  }

  const handleClose = (v: boolean) => {
    if (v) return
    setStep(1)
    setName("")
    setSiteType(undefined)
    setCreatedSlug(null)
    createMutation.reset()
    close()
  }

  // "Later" — project already exists and shows on /projects; just dismiss.
  const handleDismissAfterCreate = () => {
    handleClose(false)
    router.refresh()
  }

  // "Start generation" — hand off to the home page, which drives the 4-step
  // human-in-the-loop pipeline for this project.
  const handleStartGeneration = () => {
    const slug = createdSlug
    handleClose(false)
    router.push(`/?project=${slug}&start=1`)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        showCloseButton={false}
        className="max-w-3xl gap-0 overflow-hidden rounded-3xl border border-base bg-surface p-2.5 sm:max-w-3xl"
      >
        {/* Fixed height so step 1 and step 2 render at exactly the same size —
            no jump when advancing between them. */}
        <div className="grid h-[520px] grid-cols-1 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
          {/* ---------- Left: visual panel ---------- */}
          <div className="relative hidden flex-col justify-between overflow-hidden rounded-2xl p-7 md:flex">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(160deg, #60A5FA 0%, #6366F1 45%, #1E3A8A 100%)",
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(115deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.1) 35%, transparent 65%)",
              }}
            />
            <div
              className="absolute inset-0 opacity-[0.5] mix-blend-overlay"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='turbulence' baseFrequency='0.9' numOctaves='1' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='0 0.6 0.75 0.85 0.95 1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                backgroundSize: "60px 60px",
              }}
            />

            <p className="relative text-[12px] font-semibold uppercase tracking-widest text-white/70">
              UseFrame
            </p>

            <div className="relative flex flex-col gap-7">
              {STATS.map((s) => (
                <div key={s.label}>
                  <p className="text-[30px] font-semibold leading-none text-white">
                    {s.value}
                  </p>
                  <p className="mt-1.5 text-[12.5px] text-white/70">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ---------- Right: steps ---------- */}
          <div className="flex min-h-0 flex-col gap-6 overflow-y-auto p-7" style={{ scrollbarWidth: "none" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    step === 1 ? "w-7 bg-blue-500" : "w-1.5 bg-tertiary"
                  }`}
                />
                <span
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    step === 2 ? "w-7 bg-blue-500" : "w-1.5 bg-tertiary"
                  }`}
                />
              </div>

              <div className={`flex items-center gap-1.5 ${createdSlug ? "invisible" : ""}`}>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={step === 1 || createMutation.isPending}
                  aria-label="Previous step"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-base text-mut transition-colors hover:border-em hover:text-sec disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={step === 2}
                  aria-label="Next step"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-base text-mut transition-colors hover:border-em hover:text-sec disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </div>

            {createdSlug ? (
              <>
                <div>
                  <DialogTitle className="text-[22px] font-semibold leading-snug text-pri">
                    Project created
                  </DialogTitle>
                  <DialogDescription className="mt-2 text-[13px] leading-relaxed text-mut">
                    It&apos;s saved and visible on your Projects page. Start
                    generation now to run research, website, SEO and deploy —
                    approving each step as you go.
                  </DialogDescription>
                </div>

                <div className="mt-auto flex flex-col gap-2.5 pt-4">
                  <button
                    onClick={handleStartGeneration}
                    className="w-full rounded-2xl bg-inv py-3.5 text-[13.5px] font-semibold text-inv transition-opacity duration-150 hover:opacity-90 cursor-pointer"
                  >
                    Start generation
                  </button>
                  <button
                    onClick={handleDismissAfterCreate}
                    className="w-full rounded-2xl border border-base py-3.5 text-[13.5px] font-semibold text-sec transition-colors duration-150 hover:bg-tertiary cursor-pointer"
                  >
                    Later
                  </button>
                </div>
              </>
            ) : step === 1 ? (
              <>
                <div>
                  <DialogTitle className="text-[22px] font-semibold leading-snug text-pri">
                    How would you like to start?
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    Choose how you want to begin your project.
                  </DialogDescription>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {ENTRY_OPTIONS.map((opt) => {
                    const active = inputType === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setInputType(opt.value)}
                        className={`rounded-full border px-4 py-2.5 text-[13px] font-medium transition-all duration-150 cursor-pointer ${
                          active
                            ? "border-blue-400 bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400"
                            : "border-base text-sec hover:border-em hover:bg-tertiary"
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="project-name">Project name</Label>
                  <Input
                    id="project-name"
                    placeholder="My awesome startup"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Site type</Label>
                  <div className="flex flex-wrap gap-2">
                    {SITE_TYPES.map((t) => {
                      const active = siteType === t.value
                      return (
                        <button
                          key={t.label}
                          type="button"
                          onClick={() => setSiteType(t.value)}
                          className={`rounded-full border px-4 py-2 text-[12.5px] font-medium transition-all duration-150 cursor-pointer ${
                            active
                              ? "border-blue-400 bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400"
                              : "border-base text-sec hover:border-em hover:bg-tertiary"
                          }`}
                        >
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="mt-auto pt-4">
                  <button
                    onClick={() => setStep(2)}
                    disabled={name.trim().length < 2}
                    className="w-full rounded-2xl bg-inv py-3.5 text-[13.5px] font-semibold text-inv transition-opacity duration-150 hover:opacity-90 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <DialogTitle className="text-[22px] font-semibold leading-snug text-pri">
                    Tell us about your product
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    Project details used to generate your page.
                  </DialogDescription>
                </div>

                <ProjectForm
                  inputType={inputType}
                  name={name}
                  siteType={siteType}
                  onSubmit={handleSubmit}
                  isLoading={createMutation.isPending}
                />
              </>
            )}

            {createMutation.isError && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-[12.5px] font-medium text-red-600 dark:bg-red-950/30 dark:text-red-400">
                {createMutation.error?.message ?? "Something went wrong"}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
