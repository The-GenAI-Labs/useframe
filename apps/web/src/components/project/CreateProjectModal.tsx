"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EntryPathSelector } from "./EntryPathSelector"
import { ProjectForm } from "./ProjectForm"
import { projectsApi } from "@/lib/api/services/projects.service"
import { useProjectStore } from "@/stores/projectStore"
import type { CreateProjectInput, ProjectInputType } from "@repo/schemas"

type Props = {
  open: boolean
  onClose: () => void
}

export function CreateProjectModal({ open, onClose }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [inputType, setInputType] = useState<ProjectInputType>("FROM_SCRATCH")
  const { setProject } = useProjectStore()

  const createMutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: (result) => {
      setProject(result.project, result.version)
      onClose()
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

  const handleNext = () => setStep(2)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "How would you like to start?" : "Project details"}
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-6">
            <EntryPathSelector value={inputType} onChange={setInputType} />
            <button
              onClick={handleNext}
              className="w-full rounded-xl bg-foreground py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-80"
            >
              Continue
            </button>
          </div>
        ) : (
          <ProjectForm
            inputType={inputType}
            onSubmit={handleSubmit}
            isLoading={createMutation.isPending}
          />
        )}

        {createMutation.isError && (
          <p className="text-center text-xs text-destructive">
            {createMutation.error?.message ?? "Something went wrong"}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
