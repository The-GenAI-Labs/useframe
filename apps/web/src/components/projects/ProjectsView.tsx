"use client";

import Link from "next/link";
import { useProjectModalStore } from "@/store/projectModalStore";
import type { ProjectSummary } from "@/lib/apiServer";

const STATUS_STYLES: Record<string, string> = {
    DRAFT: "bg-tertiary text-mut",
    GENERATING: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400",
    READY: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400",
    DEPLOYING: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400",
    LIVE: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400",
    FAILED: "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400",
};

function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${STATUS_STYLES[status] ?? "bg-tertiary text-mut"}`}>
            {status.charAt(0) + status.slice(1).toLowerCase()}
        </span>
    );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
    return (
        <Link
            href={`/project/${project.slug}`}
            className="group flex flex-col gap-3 p-4 rounded-2xl border border-base bg-tertiary/40 hover:bg-tertiary hover:border-em transition-all duration-150 cursor-pointer"
        >
            <div className="flex items-start justify-between gap-2">
                <h3 className="text-[14px] font-semibold text-pri truncate">{project.name}</h3>
                {project.pinned && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="text-amber-500 shrink-0">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                )}
            </div>
            <p className="text-[12px] text-mut line-clamp-2 leading-relaxed">{project.startupIdea}</p>
            <div className="flex items-center justify-between mt-1">
                <StatusBadge status={project.status} />
                <span className="text-[11px] text-mut">
                    {new Date(project.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
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
