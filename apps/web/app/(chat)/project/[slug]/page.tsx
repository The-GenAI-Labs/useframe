"use client"

import { use, useEffect, useState } from "react"
import { notFound } from "next/navigation"
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell"
import WorkspaceLoading from "./loading"
import { projectsApi, type ProjectDetail } from "@/lib/api/services/projects.service"
import { PageFadeIn } from "@/components/shared/PageFadeIn"

type Props = {
  params: Promise<{ slug: string }>
}

export default function WorkspacePage({ params }: Props) {
  const { slug } = use(params)
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    projectsApi
      .getBySlug(slug)
      .then((data) => {
        if (!cancelled) setProject(data)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  if (error) notFound()

  if (loading || !project) {
    return (
      <div className="flex h-full flex-col bg-surface">
        <WorkspaceLoading />
      </div>
    )
  }

  return (
    <PageFadeIn>
      <div className="flex h-full flex-col bg-surface">
        <WorkspaceShell project={project} />
      </div>
    </PageFadeIn>
  )
}
