"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { EntryPathSelector } from "./EntryPathSelector"
import { ProjectForm } from "./ProjectForm"
import { projectsApi } from "@/lib/api/services/projects.service"
import { useProjectStore } from "@/stores/projectStore"
import { useProjectModalStore } from "@/store/projectModalStore"
import type { CreateProjectInput, ProjectInputType } from "@repo/schemas"

const STEP_COPY: Record<1 | 2, { title: string; description: string }> = {
  1: {
    title: "How would you like to start?",
    description: "Pick the fastest path to your first landing page.",
  },
  2: {
    title: "Project details",
    description: "Tell us about your product so AI can write copy that fits.",
  },
}

export function CreateProjectModal() {
  const router = useRouter()
  const { isOpen, close } = useProjectModalStore()
  const [step, setStep] = useState<1 | 2>(1)
  const [inputType, setInputType] = useState<ProjectInputType>("FROM_SCRATCH")
  const { setProject } = useProjectStore()

  const createMutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: (result) => {
      setProject(result.project, result.version)
      close()
      if (result.scanQueued) {
        router.push(`/project/${result.project.slug}?status=scanning`)
      } else {
        router.push(`/project/${result.project.slug}`)
      }
    },
  })

  const handleSubmit = async (data: CreateProjectInput) => {
    await createMutation.mutateAsync({ ...data, inputType })
  }

  const handleClose = (v: boolean) => {
    if (v) return
    setStep(1)
    createMutation.reset()
    close()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg gap-5 border border-base bg-card p-7">
        <DialogHeader className="gap-3">
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-6 rounded-full transition-colors ${step >= 1 ? "bg-pri" : "bg-tertiary"}`} />
            <span className={`h-1.5 w-6 rounded-full transition-colors ${step >= 2 ? "bg-pri" : "bg-tertiary"}`} />
          </div>
          <div>
            <DialogTitle className="text-[19px] font-semibold text-pri">
              {STEP_COPY[step].title}
            </DialogTitle>
            <DialogDescription className="mt-1 text-[13px] text-mut">
              {STEP_COPY[step].description}
            </DialogDescription>
          </div>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-5">
            <EntryPathSelector value={inputType} onChange={setInputType} />
            <button
              onClick={() => setStep(2)}
              className="w-full rounded-xl bg-inv py-3 text-[13.5px] font-semibold text-inv transition-opacity duration-150 hover:opacity-90 cursor-pointer"
            >
              Continue
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <ProjectForm
              inputType={inputType}
              onSubmit={handleSubmit}
              isLoading={createMutation.isPending}
            />
            <button
              onClick={() => setStep(1)}
              disabled={createMutation.isPending}
              className="flex items-center gap-1 text-[12.5px] font-medium text-mut hover:text-sec transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back
            </button>
          </div>
        )}

        {createMutation.isError && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-[12.5px] font-medium text-red-600 dark:bg-red-950/30 dark:text-red-400">
            {createMutation.error?.message ?? "Something went wrong"}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
