export function RingScore({ score, size = 96 }: { score: number; size?: number }) {
    const radius = (size - 12) / 2;
    const circumference = 2 * Math.PI * radius;
    const filled = (score / 100) * circumference;
    const color =
        score >= 80 ? "#3b82f6" : score >= 55 ? "#f59e0b" : "#ef4444";

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                style={{ stroke: "var(--border)" }}
            />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth="6"
                strokeDasharray={`${filled} ${circumference}`}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 1s cubic-bezier(.4,0,.2,1)" }}
            />
        </svg>
    );
}

export function gradeLabel(score: number) {
    if (score >= 90) return { grade: "A", color: "text-blue-600", bg: "bg-blue-50" };
    if (score >= 75) return { grade: "B", color: "text-blue-500", bg: "bg-blue-50" };
    if (score >= 60) return { grade: "C", color: "text-amber-600", bg: "bg-amber-50" };
    if (score >= 45) return { grade: "D", color: "text-orange-600", bg: "bg-orange-50" };
    return { grade: "F", color: "text-red-600", bg: "bg-red-50" };
}
