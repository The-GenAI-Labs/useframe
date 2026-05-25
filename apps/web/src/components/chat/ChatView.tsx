"use client";

export default function ChatView() {
    return (
        <div className="flex flex-col h-full w-full px-8 py-10">
            <div className="flex flex-col gap-1 mb-8">
                <h1 className="text-2xl font-semibold text-black/85 tracking-tight">Chats</h1>
                <p className="text-sm text-black/40">Your recent conversations.</p>
            </div>
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-black/4 flex items-center justify-center">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-black/30">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                    </div>
                    <p className="text-sm font-medium text-black/40">No chats yet</p>
                </div>
            </div>
        </div>
    );
}
