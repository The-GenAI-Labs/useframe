"use client";

export default function ProjectsView() {
    return (
        <div className="flex flex-col h-full w-full px-8 py-10">
            <div className="flex flex-col gap-1 mb-8">
                <h1 className="text-2xl font-semibold text-pri tracking-tight">Projects</h1>
                <p className="text-sm text-mut">All your UseFrame projects in one place.</p>
            </div>
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-tertiary flex items-center justify-center">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-mut">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                    </div>
                    <p className="text-sm font-medium text-mut">No projects yet</p>
                </div>
            </div>
        </div>
    );
}
