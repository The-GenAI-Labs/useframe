"use client"

import Image from "next/image"

const IMAGES = [
    "/auth/login1.png",
    "/auth/login2.png",
    "/auth/login3.png",
    "/auth/login4.png",
    "/auth/login5.png",
    "/auth/login6.png",
    "/auth/login7.png",
    "/auth/login8.png",
    "/auth/login9.png",
    "/auth/login10.png",
    "/auth/login14.png",
    "/auth/login12.png",
    "/auth/login13.png",
    "/auth/landing2.png",
    "/auth/landing1.png",
    "/auth/login16.png",
    "/auth/login17.png",
    "/auth/login18.png",
    "/auth/login20.png",
]

const LEFT_IMAGES = IMAGES.slice(0, 13)
const RIGHT_IMAGES = IMAGES.slice(12, 25)

interface ColumnProps {
    images: string[]
    direction: "up" | "down"
}

const CarouselColumn = ({ images, direction }: ColumnProps) => {
    const doubled = [...images, ...images]

    return (
        <div className="relative h-full overflow-hidden w-[42%]" style={{margin:"auto"}}>
            <div className="absolute -top-1 -left-1 -right-1 h-16 z-10 bg-gradient-to-b from-blue-50 to-transparent pointer-events-none" />
            <div className="absolute -bottom-3 -left-1 -right-1 h-16 z-10 bg-gradient-to-t from-blue-50 to-transparent pointer-events-none" />

            <div
                className={`flex flex-col gap-3 ${direction === "up" ? "animate-scroll-up" : "animate-scroll-down"
                    }`}
            >
                {doubled.map((src, i) => (
                    <div
                        key={i}
                        className="relative border-[10px] border-white rounded-2xl w-[full] aspect-[4/3] overflow-hidden flex-shrink-0 shadow-sm"
                    >
                        <Image
                            src={src}
                            alt={`preview ${i}`}
                            fill
                            className="object-cover rounded-lg"
                            sizes="20vw"
                        />
                    </div>
                ))}
            </div>
        </div>
    )
}

const AuthLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="min-h-screen flex items-center justify-center p-2 md:p-4" style={{
            backgroundColor: "#dbeafe",
            backgroundImage: `linear-gradient(rgba(0,0,0,0.01) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.15) 1px, transparent 1px)`,
            backgroundSize: "3px 3px",
        }}>

            <div className="bg-white dark:bg-white flex items-stretch rounded-3xl md:rounded-4xl overflow-hidden shadow-xl h-[96vh] md:h-[93vh] w-full md:w-[95vw] max-w-7xl">

                <div className="hidden md:flex items-center justify-center w-[50%] bg-blue-50 p-5">

                    <div className="relative flex gap-3 w-full h-full rounded-2xl overflow-hidden">

                        <CarouselColumn images={LEFT_IMAGES} direction="up" />
                        <CarouselColumn images={RIGHT_IMAGES} direction="down" />

                        <div className="absolute inset-x-0 top-8 flex justify-center pointer-events-none z-20">
                            <div className="absolute w-[300px] h-[80px] rounded-full bg-white/40 blur-2xl" />
                            <div
                                className="relative flex items-center gap-3 px-5 py-3 rounded-full border border-white/50"
                                style={{
                                    background: "rgba(255,255,255,0.22)",
                                    backdropFilter: "blur(14px)",
                                    WebkitBackdropFilter: "blur(14px)",
                                    boxShadow: "0 8px 32px rgba(59,130,246,0.15), inset 0 1px 0 rgba(255,255,255,0.6)",
                                }}
                            >
                                <div className="w-12 h-px bg-gradient-to-r from-transparent to-blue-400/80" />
                                <span
                                    className="text-md font-bold tracking-[0.22em] uppercase whitespace-nowrap"
                                    style={{
                                        color: "#1e40af",
                                        textShadow: "0 1px 10px rgba(255,255,255,0.9)",
                                    }}
                                >
                                    Backed by Science
                                </span>

                                <div className="w-12 h-px bg-gradient-to-l from-transparent to-blue-400/80" />
                            </div>
                        </div>

                    </div>
                </div>

                <div className="relative flex-1 flex flex-col justify-center px-5 py-8 md:px-10 md:py-12 overflow-hidden">
                    <div
                        className="absolute inset-x-0 bottom-0 h-[55%] pointer-events-none"
                        style={{
                            backgroundImage: `
                                linear-gradient(rgba(59,130,246,0.18) 1px, transparent 1px),
                                linear-gradient(90deg, rgba(59,130,246,0.18) 1px, transparent 1px)
                            `,
                            backgroundSize: "12px 12px",
                            WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 35%, transparent 100%)",
                            maskImage: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 35%, transparent 100%)",
                        }}
                    />

                    <div
                        className="absolute inset-x-0 bottom-0 h-[40%] pointer-events-none"
                        style={{
                            background: "radial-gradient(ellipse 80% 60% at 50% 110%, rgba(99,179,237,0.22) 0%, transparent 70%)",
                        }}
                    />
                    <div
                        className="absolute inset-x-0 bottom-0 h-24 pointer-events-none"
                        style={{
                            background: "linear-gradient(to top, rgba(219,234,254,0.35) 0%, transparent 100%)",
                        }}
                    />
                    <div
                        className="absolute inset-x-0 top-0 h-[55%] pointer-events-none"
                        style={{
                            backgroundImage: `
                                linear-gradient(rgba(59,130,246,0.13) 1px, transparent 1px),
                                linear-gradient(90deg, rgba(59,130,246,0.13) 1px, transparent 1px)
                            `,
                            backgroundSize: "12px 12px",
                            WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 35%, transparent 100%)",
                            maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 35%, transparent 100%)",
                        }}
                    />

                    <div
                        className="absolute inset-x-0 top-0 h-[40%] pointer-events-none"
                        style={{
                            background: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,179,237,0.22) 0%, transparent 70%)",
                        }}
                    />
                    <div
                        className="absolute inset-x-0 top-0 h-24 pointer-events-none"
                        style={{
                            background: "linear-gradient(to bottom, rgba(219,234,254,0.35) 0%, transparent 100%)",
                        }}
                    />

                    <div className="relative z-10 overflow-y-auto flex flex-col justify-center flex-1">
                        {children}
                    </div>
                </div>

            </div>
        </div>
    )
}

export default AuthLayout