"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ModelSelector } from "./ModelSelector";

const schema = z.object({
    message: z
        .string()
        .min(1, "Message cannot be empty")
        .max(2000, "Message too long")
        .transform((v) => v.trim()),
});

type FormValues = z.infer<typeof schema>;

interface ModalChatInputProps {
    onSend: (text: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
    defaultValue?: string;
}

export const ModalChatInput = memo(function ModalChatInput({
    onSend,
    placeholder = "Describe a task, change, or workflow…",
    autoFocus,
    defaultValue = "",
}: ModalChatInputProps) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const {
        register,
        handleSubmit,
        reset,
        watch,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { message: defaultValue },
    });

    const message = watch("message");

    const onValid = useCallback(
        (data: FormValues) => {
            onSend(data.message);
            reset();
        },
        [onSend, reset]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(onValid)();
            }
        },
        [handleSubmit, onValid]
    );

    const { ref: rhfRef, ...rest } = register("message");
    const setRef = useCallback(
        (el: HTMLTextAreaElement | null) => {
            rhfRef(el);
            (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
        },
        [rhfRef]
    );

    useEffect(() => {
        if (autoFocus) textareaRef.current?.focus();
    }, [autoFocus]);

    const canSend = message.trim().length > 0;

    return (
        <div className="flex flex-col gap-2">
            <div className={`border rounded-2xl overflow-hidden transition-colors ${errors.message ? "border-red-300" : "border-base"}`} style={{ backgroundColor: "var(--bg-primary)" }}>
                <div className="px-3.5 pt-3 pb-2">
                    <textarea
                        {...rest}
                        ref={setRef}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        rows={2}
                        className="w-full resize-none bg-transparent text-sm text-pri placeholder:text-mut outline-none leading-relaxed"
                    />
                </div>

                <div className="flex items-center justify-between px-3 pb-2.5">
                    <div className="flex items-center gap-1.5">
                        <button type="button" className="p-1.5 rounded-lg hover:bg-tertiary transition-colors text-mut hover:text-sec cursor-pointer">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                            </svg>
                        </button>

                        <div className="w-px h-3.5 border-base" style={{ backgroundColor: "var(--border)" }} />

                        <ModelSelector />

                        <button type="button" className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-tertiary transition-colors text-mut hover:text-sec text-[11px] cursor-pointer">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" />
                                <path d="M12 6v6l4 2" />
                            </svg>
                            Deep work
                        </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <button type="button" className="p-1.5 rounded-lg hover:bg-tertiary transition-colors text-mut hover:text-sec cursor-pointer">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                                <path d="M19 10v2a7 7 0 01-14 0v-2" />
                                <line x1="12" y1="19" x2="12" y2="23" />
                                <line x1="8" y1="23" x2="16" y2="23" />
                            </svg>
                        </button>

                        <button
                            type="button"
                            onClick={handleSubmit(onValid)}
                            disabled={!canSend}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all cursor-pointer"
                            style={{ backgroundColor: "var(--text-primary)" }}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                                <line x1="12" y1="19" x2="12" y2="5" />
                                <polyline points="5 12 12 5 19 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {errors.message && (
                <p className="text-xs text-red-500 px-1">{errors.message.message}</p>
            )}
        </div>
    );
});
