// Same frame as Layout (rail + rounded main panel), shown while the session check runs.
export function AppShellSkeleton({ className = "flex", children }: { className?: string; children?: React.ReactNode }) {
    return (
        <div className={`${className} items-center justify-center h-screen w-screen bg-shell`} aria-busy="true">
            <div className="flex h-full md:h-[96vh] w-full md:w-[98vw] md:rounded-3xl overflow-hidden">
                <div className="hidden md:flex md:w-14 shrink-0 flex-col items-center gap-3 pt-4 animate-pulse" aria-hidden="true">
                    {Array.from({ length: 4 }, (_, i) => (
                        <span key={i} className="h-9 w-9 rounded-xl bg-black/5 dark:bg-white/10" />
                    ))}
                </div>
                <main className="relative flex-1 h-full bg-surface overflow-hidden md:rounded-3xl md:ml-2">
                    {children}
                </main>
            </div>
        </div>
    );
}
