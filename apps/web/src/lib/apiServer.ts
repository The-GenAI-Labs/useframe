import "server-only"
import { getBridgeToken } from "@/lib/bridgeToken"

const API_SERVICE_URL = process.env.API_SERVICE_URL ?? "http://localhost:4000"

type ApiResponse<T> = {
    success: boolean
    message?: string
    data?: T
    errors?: Record<string, string[]>
}

export class ApiServerError extends Error {
    status: number
    errors?: Record<string, string[]>

    constructor(message: string, status: number, errors?: Record<string, string[]>) {
        super(message)
        this.status = status
        this.errors = errors
    }
}

async function apiFetch<T>(
    path: string,
    init?: RequestInit
): Promise<T> {
    const token = await getBridgeToken()
    if (!token) throw new ApiServerError("Unauthorized", 401)

    const res = await fetch(`${API_SERVICE_URL}${path}`, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...init?.headers,
        },
        cache: "no-store",
    })

    const body = (await res.json().catch(() => null)) as ApiResponse<T> | null

    if (!res.ok || !body?.success) {
        throw new ApiServerError(
            body?.message ?? `Request failed with status ${res.status}`,
            res.status,
            body?.errors
        )
    }

    return body.data as T
}

export type ProjectSummary = {
    id: string
    slug: string
    name: string
    status: string
    pinned: boolean
    niche: string
    inputType: string
    startupIdea: string
    targetAudience: string
    sourceUrl: string | null
    currentVersionId: string | null
    createdAt: string
    updatedAt: string
}

export type CreateProjectResult = {
    project: {
        id: string
        slug: string
        name: string
        status: string
        inputType: string
    }
    version: { id: string; versionNumber: number }
    scanQueued: boolean
}

export type ProjectDetail = {
    id: string
    slug: string
    name: string
    status: string
    inputType: string
    niche: string
    startupIdea: string
    targetAudience: string
    sourceUrl: string | null
    versions: {
        id: string
        versionNumber: number
        siteType: string
        snapshot: unknown
        createdAt: string
    }[]
    competitorScans: {
        id: string
        status: string
        designTokens: Record<string, unknown> | null
        extractedContent: Record<string, unknown> | null
    }[]
}

export type ProjectVersionSummary = {
    id: string
    versionNumber: number
    label: string | null
    siteType: string
    snapshot: unknown
    createdAt: string
}

export type CreateVersionResult = {
    version: { id: string; versionNumber: number }
}

export const apiServer = {
    listProjects: () => apiFetch<ProjectSummary[]>("/api/projects"),

    createProject: (input: Record<string, unknown>) =>
        apiFetch<CreateProjectResult>("/api/projects", {
            method: "POST",
            body: JSON.stringify(input),
        }),

    getProjectBySlug: (slug: string) =>
        apiFetch<ProjectDetail>(`/api/projects/${slug}`),

    listVersions: (slug: string) =>
        apiFetch<ProjectVersionSummary[]>(`/api/projects/${slug}/versions`),

    createVersion: (slug: string) =>
        apiFetch<CreateVersionResult>(`/api/projects/${slug}/versions`, {
            method: "POST",
        }),
}
