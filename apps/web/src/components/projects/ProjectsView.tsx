"use client";

import Link from "next/link";
import { useProjectModalStore } from "@/store/projectModalStore";
import type { ProjectListItem as ProjectSummary } from "@/lib/api/services/projects.service";

const STATUS_STYLES: Record<string, string> = {
    DRAFT: "bg-tertiary text-mut",
    GENERATING: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400",
    READY: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400",
    DEPLOYING: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400",
    LIVE: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400",
    FAILED: "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400",
};

// Gradient header per status — mirrors the billing page's tier cards so the
// two surfaces read as one system.
const STATUS_GRADIENTS: Record<string, string> = {
    DRAFT: "from-slate-400 via-slate-500 to-slate-700",
    GENERATING: "from-sky-400 via-blue-500 to-indigo-600",
    READY: "from-blue-500 via-blue-600 to-indigo-700",
    DEPLOYING: "from-sky-400 via-blue-500 to-indigo-600",
    LIVE: "from-emerald-400 via-teal-500 to-blue-700",
    FAILED: "from-rose-400 via-red-500 to-slate-800",
};

const NOISE_URL =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='turbulence' baseFrequency='0.9' numOctaves='1' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='0 0.6 0.75 0.85 0.95 1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${STATUS_STYLES[status] ?? "bg-tertiary text-mut"}`}>
            {status.charAt(0) + status.slice(1).toLowerCase()}
        </span>
    );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
    const gradient = STATUS_GRADIENTS[project.status] ?? STATUS_GRADIENTS.DRAFT;

    return (
        <Link
            href={`/project/${project.slug}`}
            className="group flex flex-col rounded-3xl border border-base bg-surface shadow-sm overflow-hidden transition-all duration-200 hover:border-em hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
        >
            <div className={`relative h-20 bg-gradient-to-br overflow-hidden ${gradient}`}>
                <div
                    className="absolute inset-0"
                    style={{ background: "linear-gradient(115deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.08) 35%, transparent 60%)" }}
                />
                <div
                    className="absolute inset-0 opacity-[0.5] mix-blend-overlay"
                    style={{ backgroundImage: NOISE_URL, backgroundSize: "60px 60px" }}
                />
                {project.pinned && (
                    <span className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full border border-white/30 bg-white/20 backdrop-blur-sm">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="text-white">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                    </span>
                )}
                <div className="absolute bottom-3 left-4 right-4">
                    <h3 className="truncate text-[15px] font-bold text-white">{project.name}</h3>
                </div>
            </div>

            <div className="flex flex-1 flex-col gap-3 px-4 py-4">
                <p className="line-clamp-2 text-[12px] leading-relaxed text-mut">{project.startupIdea}</p>
                <div className="mt-auto flex items-center justify-between">
                    <StatusBadge status={project.status} />
                    <span className="text-[11px] text-mut">
                        {new Date(project.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                </div>
            </div>
        </Link>
    );
}

export default function ProjectsView({ initialProjects }: { initialProjects: ProjectSummary[] }) {
    const openProjectModal = useProjectModalStore((s) => s.open);

    return (
        <div className="flex flex-col h-full w-full px-8 py-10">
            <div className="flex items-center justify-between mb-8">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-pri tracking-tight">Projects</h1>
                    <p className="text-sm text-mut">All your UseFrame projects in one place.</p>
                </div>
                <button
                    onClick={openProjectModal}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-inv text-inv text-[13px] font-semibold hover:opacity-90 transition-opacity duration-150 cursor-pointer"
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                    New Project
                </button>
            </div>

            {initialProjects.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3 text-center">
                        <div className="w-12 h-12 rounded-2xl bg-tertiary flex items-center justify-center">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-mut">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                        </div>
                        <p className="text-sm font-medium text-mut">No projects yet</p>
                        <button
                            onClick={openProjectModal}
                            className="text-[13px] font-semibold text-pri underline underline-offset-2 cursor-pointer"
                        >
                            Create your first project
                        </button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {initialProjects.map((project) => (
                        <ProjectCard key={project.id} project={project} />
                    ))}
                </div>
            )}
        </div>
    );
}
