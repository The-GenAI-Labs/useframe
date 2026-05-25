"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { useSendMagicLink } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";

const schema = z.object({
    email: z.string().email("Enter a valid email address"),
});

type FormValues = z.infer<typeof schema>;

export const MagicLinkForm = () => {
    const { mutate, isPending, error } = useSendMagicLink();
    const { magicLinkSent, magicLinkEmail } = useAuthStore();

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
    });

    const onSubmit = (data: FormValues) => {
        mutate(data.email);
    };

    if (magicLinkSent) {
        return (
            <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-blue-500" />
                </div>
                <p className="text-sm font-medium text-gray-700">Check your email</p>
                <p className="text-xs text-zinc-400 text-center">
                    We sent a magic link to{" "}
                    <span className="font-medium text-zinc-600">{magicLinkEmail}</span>
                </p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                <Input
                    type="email"
                    placeholder="john.doe@email.com"
                    {...register("email")}
                    className="pl-9 h-11 text-gray-600 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-blue-300"
                />
            </div>

            {(errors.email || error) && (
                <p className="text-xs text-red-500">
                    {errors.email?.message ?? error?.message}
                </p>
            )}

            <Button
                type="submit"
                disabled={isPending}
                className="w-full h-11 bg-blue-100 shadow-md hover:bg-blue-200 text-blue-600 font-medium border-0 cursor-pointer focus-visible:ring-0"
                variant="outline"
            >
                {isPending ? "Sending link..." : "Continue with email"}
            </Button>
        </form>
    );
};
