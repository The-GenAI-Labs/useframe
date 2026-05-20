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

// split into two columns
const LEFT_IMAGES = IMAGES.slice(0, 13)   // 13 images
const RIGHT_IMAGES = IMAGES.slice(12, 25)  // 13 images (slight overlap for variety)

interface ColumnProps {
    images: string[]
    direction: "up" | "down"
}

const CarouselColumn = ({ images, direction }: ColumnProps) => {
    // duplicate for seamless infinite loop
    const doubled = [...images, ...images]

    return (
        <div className="relative h-full overflow-hidden w-[42%]" style={{margin:"auto"}}>
            {/* top fade */}
            <div className="absolute -top-1 -left-1 -right-1 h-16 z-10 bg-gradient-to-b from-orange-50 to-transparent pointer-events-none" />

            {/* bottom fade */}
            <div className="absolute -bottom-3 -left-1 -right-1 h-16 z-10 bg-gradient-to-t from-orange-50 to-transparent pointer-events-none" />

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
                            className="object-cover"
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
        <div className="min-h-screen flex items-center justify-center p-4" style={{
            backgroundColor: "#fed3a2",
            backgroundImage: `linear-gradient(rgba(0,0,0,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.07) 1px, transparent 1px)`,
            backgroundSize: "32px 32px",
        }}>
            <div className="bg-white dark:bg-white flex items-stretch rounded-4xl overflow-hidden shadow-xl h-[93vh] w-[95vw] max-w-7xl">

                {/* left — carousel panel */}
                <div className="hidden md:flex items-center justify-center w-[50%] bg-orange-50 p-4">
                    <div className="flex gap-3 w-full h-[95%] rounded-4xl overflow-hidden">
                        <CarouselColumn images={LEFT_IMAGES} direction="up" />
                        <CarouselColumn images={RIGHT_IMAGES} direction="down" />
                    </div>
                </div>

                {/* right — form panel */}
                <div className="flex-1 flex flex-col justify-center px-10 py-12 overflow-y-auto">
                    {children}
                </div>

            </div>
        </div>
    )
}

export default AuthLayout