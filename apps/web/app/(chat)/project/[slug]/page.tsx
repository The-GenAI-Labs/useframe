import { Suspense } from "react"
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@useframe/db"
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell"
import WorkspaceLoading from "./loading"

type Props = {
  params: Promise<{ slug: string }>
}

export default async function WorkspacePage({ params }: Props) {
  const { slug } = await params
  const session = await auth()
  if (!session?.user?.id) notFound()

  const project = await prisma.project.findFirst({
    where: { slug, userId: session.user.id, deletedAt: null },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        select: {
          id: true,
          versionNumber: true,
          label: true,
          siteType: true,
          snapshot: true,
          createdAt: true,
        },
      },
      competitorScans: {
        where: {
          status: { in: ["QUEUED", "RENDERING", "EXTRACTING", "ANALYZING", "DONE"] },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          designTokens: true,
          extractedContent: true,
        },
      },
    },
  })

  if (!project) notFound()

  const serialised = {
    ...project,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    versions: project.versions.map((v) => ({
      ...v,
      createdAt: v.createdAt.toISOString(),
    })),
    competitorScans: project.competitorScans.map((s) => ({
      ...s,
      designTokens: s.designTokens as Record<string, unknown> | null,
      extractedContent: s.extractedContent as Record<string, unknown> | null,
    })),
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      <Suspense fallback={<WorkspaceLoading />}>
        <WorkspaceShell project={serialised} />
      </Suspense>
    </div>
  )
}
