import AuthLayout from "@/components/auth/AuthLayout"

export default function AuthLogin({
    children
}: {
    children: React.ReactNode
}) {
    return (
        <AuthLayout>
            {children}
        </AuthLayout>
    )
}