"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { projectsApi } from "@/lib/api/services/projects.service"
import { useExtractStore } from "@/stores/extractStore"
import { usePlanStream } from "@/hooks/usePlanStream"
import type { NicheCategory } from "@repo/schemas"

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:4001"

const NICHES = [
  "EDTECH",
  "HEALTH_WELLNESS",
  "FINTECH",
  "SAAS_B2B",
  "ECOMMERCE",
  "FOOD_LIFESTYLE",
  "FITNESS",
  "LUXURY",
  "MEDITATION",
  "KIDS",
  "OTHER",
] as const

const NICHE_LABELS: Record<string, string> = {
  EDTECH: "EdTech",
  HEALTH_WELLNESS: "Health & Wellness",
  FINTECH: "FinTech",
  SAAS_B2B: "SaaS / B2B",
  ECOMMERCE: "E-Commerce",
  FOOD_LIFESTYLE: "Food & Lifestyle",
  FITNESS: "Fitness",
  LUXURY: "Luxury",
  MEDITATION: "Meditation",
  KIDS: "Kids",
  OTHER: "Other",
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// The minimal, post-extract create form: name, industry, target audience,
// optional "your current site" URL. Distinct from CreateProjectModal (kept
// untouched, still used from ProjectsView's "New project" entry point) — this
// one is only reachable from the new home-page extract flow, pre-filled with
// whatever the extraction + Q&A pass already inferred.
export function MinimalCreateProjectModal({ open, onOpenChange }: Props) {
  const router = useRouter()
  const { ideaText, extracted, reset } = useExtractStore()
  const { startPlan } = usePlanStream()

  const [name, setName] = useState("")
  const [niche, setNiche] = useState<NicheCategory | "">("")
  const [targetAudience, setTargetAudience] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")

  useEffect(() => {
    if (!open) return
    setName(extracted.name ?? "")
    setNiche((extracted.niche as NicheCategory) ?? "")
    setTargetAudience(extracted.targetAudience ?? "")
    setSourceUrl("")
  }, [open, extracted])

  const createMutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: (result) => {
      onOpenChange(false)
      reset()

      startPlan(ORCHESTRATOR_URL, {
        projectId: result.project.id,
        versionId: result.version.id,
        tier: result.tier,
        ideaText,
        niche: niche || "OTHER",
        targetAudience,
        sourceUrl: sourceUrl || undefined,
        extracted,
      })

      router.push(`/project/${result.project.slug}?status=planning`)
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !niche || !targetAudience) return

    await createMutation.mutateAsync({
      name,
      startupIdea: ideaText.slice(0, 2000),
      niche,
      targetAudience,
      inputType: sourceUrl ? "FROM_OWN_SITE" : "FROM_SCRATCH",
      sourceUrl: sourceUrl || undefined,
      ideaText,
      extracted,
    })
  }

  const handleClose = (v: boolean) => {
    if (v) return
    createMutation.reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg gap-5 border border-base bg-card p-7">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-[19px] font-semibold text-pri">
            A few final details
          </DialogTitle>
          <DialogDescription className="text-[13px] text-mut">
            We&apos;ll use this to research competitors and build your design brief.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mc-name">Project name</Label>
            <Input
              id="mc-name"
              placeholder="My awesome startup"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Industry</Label>
              <Select value={niche} onValueChange={(v) => setNiche(v as NicheCategory)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={6} className="z-9999">
                  {NICHES.map((n) => (
                    <SelectItem key={n} value={n}>
                      {NICHE_LABELS[n]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mc-audience">Target audience</Label>
              <Input
                id="mc-audience"
                placeholder="e.g. Freelance designers, 25-40"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mc-source">Your current site (optional)</Label>
            <Input
              id="mc-source"
              type="url"
              placeholder="https://example.com"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          </div>

          <Button
            type="submit"
            className="w-full rounded-xl bg-inv py-3 text-[13.5px] font-semibold text-inv hover:bg-inv hover:opacity-90"
            disabled={createMutation.isPending || !name || !niche || !targetAudience}
          >
            {createMutation.isPending ? "Creating..." : "Create project"}
          </Button>

          {createMutation.isError && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-[12.5px] font-medium text-red-600 dark:bg-red-950/30 dark:text-red-400">
              {createMutation.error?.message ?? "Something went wrong"}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
