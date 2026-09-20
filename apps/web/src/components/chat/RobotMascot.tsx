export function RobotMascot() {
    return (
        <div className="relative w-20 h-20 rounded-3xl bg-linear-to-br from-blue-400 to-blue-600 shadow-lg flex items-center justify-center shrink-0">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="2" x2="12" y2="5" />
                <circle cx="12" cy="2" r="1" fill="white" stroke="none" />
                <rect x="5" y="5" width="14" height="12" rx="4" />
                <circle cx="9.5" cy="10.5" r="1.3" fill="white" stroke="none" />
                <circle cx="14.5" cy="10.5" r="1.3" fill="white" stroke="none" />
                <path d="M9.5 13.5c.7.6 1.6.9 2.5.9s1.8-.3 2.5-.9" />
                <path d="M5 20h14" strokeWidth="1.3" />
                <path d="M8 20v-1a4 4 0 018 0v1" strokeWidth="1.3" />
            </svg>
        </div>
    );
}
