"use client";

export default function ResearchView() {
    return (
        <div className="flex flex-col h-full w-full px-8 py-10">
            <div className="flex flex-col gap-1 mb-8">
                <h1 className="text-2xl font-semibold text-black/85 tracking-tight">Research</h1>
                <p className="text-sm text-black/40">Explore science-backed insights for your pages.</p>
            </div>
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-black/4 flex items-center justify-center">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-black/30">
                            <circle cx="12" cy="12" r="10" />
                            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                        </svg>
                    </div>
                    <p className="text-sm font-medium text-black/40">Research coming soon</p>
                </div>
            </div>
        </div>
    );
}
