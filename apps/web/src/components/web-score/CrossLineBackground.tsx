"use client";

// Same cross-hatch grid effect used behind the sign-in form: a fine grid,
// masked to fade out toward the vertical middle, coming in from both the
// top and bottom edges, with a soft radial glow at each edge.
export function CrossLineBackground() {
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div
                className="absolute inset-x-0 top-0 h-2/3"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(59,130,246,0.14) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(59,130,246,0.14) 1px, transparent 1px)
                    `,
                    backgroundSize: "14px 14px",
                    WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 55%, transparent 100%)",
                    maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 55%, transparent 100%)",
                }}
            />
            <div
                className="absolute inset-x-0 top-0 h-1/2"
                style={{
                    background: "radial-gradient(ellipse 70% 60% at 50% -10%, rgba(59,130,246,0.16) 0%, transparent 70%)",
                }}
            />

            <div
                className="absolute inset-x-0 bottom-0 h-2/3"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(59,130,246,0.14) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(59,130,246,0.14) 1px, transparent 1px)
                    `,
                    backgroundSize: "14px 14px",
                    WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 55%, transparent 100%)",
                    maskImage: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 55%, transparent 100%)",
                }}
            />
            <div
                className="absolute inset-x-0 bottom-0 h-1/2"
                style={{
                    background: "radial-gradient(ellipse 70% 60% at 50% 110%, rgba(59,130,246,0.16) 0%, transparent 70%)",
                }}
            />
        </div>
    );
}
