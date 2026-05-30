"use client";

import { memo, useCallback } from "react";
import { useForm } from "react-hook-form";

interface ChatInputForm {
    message: string;
}

interface ChatInputProps {
    onSubmit: (message: string) => void;
}

const SUGGESTIONS = ["Identify similar images online", "Summarize this transcript", "Analyze the contents"];

export default memo(function ChatInput({ onSubmit }: ChatInputProps) {
    const { register, handleSubmit, reset, watch } = useForm<ChatInputForm>({
        defaultValues: { message: "" },
    });

    const message = watch("message");

    const onFormSubmit = useCallback(
        (data: ChatInputForm) => {
            if (!data.message.trim()) return;
            onSubmit(data.message.trim());
            reset();
        },
        [onSubmit, reset]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(onFormSubmit)();
            }
        },
        [handleSubmit, onFormSubmit]
    );

    return (
        <div className="w-full flex flex-col gap-3">
            <div className="bg-surface border border-base rounded-3xl shadow-sm overflow-hidden">
                <div className="px-4 pt-3 pb-2">
                    <textarea
                        {...register("message")}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask me anything..."
                        rows={2}
                        className="w-full resize-none bg-transparent text-sm text-pri placeholder:text-mut outline-none leading-relaxed"
                    />
                </div>

                <div className="flex items-center justify-between px-3 pb-3">
                    <div className="flex items-center gap-1">
                        <button className="p-1.5 rounded-lg hover:bg-tertiary transition-colors text-mut hover:text-sec cursor-pointer">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                            </svg>
                        </button>
                        <button className="p-1.5 rounded-lg hover:bg-tertiary transition-colors text-mut hover:text-sec cursor-pointer">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                            </svg>
                        </button>
                        <div className="w-px h-4 mx-1" style={{ backgroundColor: "var(--border)" }} />
                        <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-tertiary transition-colors text-mut hover:text-sec text-xs cursor-pointer">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                            </svg>
                            Prompt Library
                        </button>
                        <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-tertiary transition-colors text-mut hover:text-sec text-xs cursor-pointer">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                            </svg>
                            Improve Prompt
                        </button>
                    </div>

                    <button
                        onClick={handleSubmit(onFormSubmit)}
                        disabled={!message.trim()}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all cursor-pointer"
                        style={{ backgroundColor: "var(--text-primary)" }}
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="19" x2="12" y2="5" />
                            <polyline points="5 12 12 5 19 12" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-center">
                {SUGGESTIONS.map((s) => (
                    <button
                        key={s}
                        onClick={() => onSubmit(s)}
                        className="px-3 py-1.5 rounded-full border border-base bg-surface text-xs text-sec hover:text-pri hover:border-em hover:bg-tertiary transition-all cursor-pointer whitespace-nowrap"
                    >
                        {s}
                    </button>
                ))}
            </div>
        </div>
    );
});
