import Image from "next/image"

const AuthLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-orange-200 p-4">
            <div className="bg-white dark:bg-white flex items-stretch rounded-4xl overflow-hidden shadow-xl h-[93vh] w-[95vw] max-w-7xl">

                {/* left — image panel */}
                <div className="hidden md:block w-[45%] relative">
                    <Image
                        src="/paper.jpeg"
                        alt="Auth background"
                        fill
                        className="object-cover"
                        priority
                    />
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