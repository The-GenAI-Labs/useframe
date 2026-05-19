import AuthForm from "@/components/auth/AuthForm";
import AuthLayout from "@/components/auth/AuthLayout"

const Signup = () => {
    return (
        <AuthLayout >
            <AuthForm mode="signup" />
        </AuthLayout>
    )
}

export default Signup;