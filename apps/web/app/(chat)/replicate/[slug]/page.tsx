"use client"

import { use, useEffect, useState } from "react"
import { notFound } from "next/navigation"
import ReplicationBuildView from "@/components/replicate/ReplicationBuildView"
import { replicateApi, type ReplicationDetail } from "@/lib/api/services/replicate.service"
import { PageFadeIn } from "@/components/shared/PageFadeIn"

type Props = {
  params: Promise<{ slug: string }>
}

export default function ReplicationBuildPage({ params }: Props) {
  const { slug } = use(params)
  const [replication, setReplication] = useState<ReplicationDetail | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    replicateApi
      .getBySlug(slug)
      .then((data) => {
        if (!cancelled) setReplication(data)
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

  if (loading || !replication) {
    return <div className="flex h-full flex-col bg-surface" />
  }

  return (
    <PageFadeIn>
      <div className="flex h-full flex-col bg-surface">
        <ReplicationBuildView replication={replication} />
      </div>
    </PageFadeIn>
  )
}
