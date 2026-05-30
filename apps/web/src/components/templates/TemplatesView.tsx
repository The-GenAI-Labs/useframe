"use client";

export default function TemplatesView() {
    return (
        <div className="flex flex-col h-full w-full px-8 py-10">
            <div className="flex flex-col gap-1 mb-8">
                <h1 className="text-2xl font-semibold text-pri tracking-tight">Templates</h1>
                <p className="text-sm text-mut">Pre-built page templates to get started fast.</p>
            </div>
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-tertiary flex items-center justify-center">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-mut">
                            <rect x="3" y="3" width="7" height="7" rx="1" />
                            <rect x="14" y="3" width="7" height="7" rx="1" />
                            <rect x="3" y="14" width="7" height="7" rx="1" />
                            <rect x="14" y="14" width="7" height="7" rx="1" />
                        </svg>
                    </div>
                    <p className="text-sm font-medium text-mut">Templates coming soon</p>
                </div>
            </div>
        </div>
    );
}
