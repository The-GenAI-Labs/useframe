export default function AuthLogin({
    children
}: {
    children: React.ReactNode
}) {
    return (
        <div className="auth-layout">
            {children}
        </div>
    )
}