import { Mail } from "lucide-react"
import Link from "next/link"

const VerifyRequest = () => {
    return (
        <div className="w-full max-w-[380px] mx-auto flex flex-col items-center gap-6 text-center">
            <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center">
                <Mail className="w-7 h-7 text-orange-500" />
            </div>
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-gray-800">Check your email</h1>
                <p className="text-sm text-zinc-500 leading-relaxed">
                    A sign-in link has been sent to your email address.
                    Click the link to sign in to UseFrame.
                </p>
            </div>
            <p className="text-xs text-zinc-400">
                Didn't receive it?{" "}
                <Link href="/login" className="text-orange-500 hover:text-orange-600 font-medium">
                    Try again
                </Link>
            </p>
        </div>
    )
}

export default VerifyRequest