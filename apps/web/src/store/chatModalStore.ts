import { create } from "zustand";
import { projectsApi } from "@/lib/api/services/projects.service";
import { chatApi } from "@/lib/api/services/chat.service";

export type Role = "user" | "assistant";

export interface PdfAttachmentData {
    type: "pdf";
    documentId: string;
    title: string;
    url: string;
}

export interface Message {
    id: string;
    role: Role;
    content: string;
    createdAt: Date;
    producedVersion?: { id: string; versionNumber: number } | null;
    isError?: boolean;
    // Generated research reports, rendered inline beneath the message text.
    attachments?: PdfAttachmentData[] | null;
}

export type ModalStatus = "closed" | "open" | "minimized";

interface ChatModalState {
    status: ModalStatus;
    messages: Message[];
    inputDraft: string;
    activeChatId: string | null;
    isStreaming: boolean;

    projectSlug: string | null;
    versionId: string | null;
    conversationId: string | null;

    open: () => void;
    close: () => void;
    minimize: () => void;
    restore: () => void;
    sendMessage: (content: string) => void;
    setInputDraft: (v: string) => void;
    reset: () => void;
    setProjectContext: (slug: string | null, versionId: string | null) => void;
}

let msgCounter = 0;
const uid = () => `msg-${++msgCounter}-${Date.now()}`;

export const useChatModalStore = create<ChatModalState>((set, get) => ({
    status: "closed",
    messages: [],
    inputDraft: "",
    activeChatId: null,
    isStreaming: false,

    projectSlug: null,
    versionId: null,
    conversationId: null,

    open: () => set({ status: "open" }),
    close: () => set({ status: "closed" }),
    minimize: () => set({ status: "minimized" }),
    restore: () => set({ status: "open" }),

    setInputDraft: (v) => set({ inputDraft: v }),

    setProjectContext: (slug, versionId) =>
        set({ projectSlug: slug, versionId }),

    sendMessage: (content) => {
        const { projectSlug, versionId } = get();

        const userMsg: Message = {
            id: uid(),
            role: "user",
            content,
            createdAt: new Date(),
        };

        set((s) => ({
            messages: [...s.messages, userMsg],
            inputDraft: "",
            isStreaming: true,
        }));

        const onSuccess = (result: {
            message: { content: string };
            conversationId: string;
            newVersion?: { id: string; versionNumber: number } | null;
        }) => {
            const assistantMsg: Message = {
                id: uid(),
                role: "assistant",
                content: result.message.content,
                createdAt: new Date(),
                producedVersion: result.newVersion ?? null,
            };
            set((s) => ({
                messages: [...s.messages, assistantMsg],
                conversationId: result.conversationId,
                isStreaming: false,
            }));
        };

        const onError = (err: unknown) => {
            const errorMsg: Message = {
                id: uid(),
                role: "assistant",
                content:
                    err instanceof Error
                        ? err.message
                        : "Something went wrong. Please try again.",
                createdAt: new Date(),
                isError: true,
            };
            set((s) => ({
                messages: [...s.messages, errorMsg],
                isStreaming: false,
            }));
        };

        if (projectSlug && versionId) {
            projectsApi
                .sendMessage(projectSlug, {
                    conversationId: get().conversationId ?? undefined,
                    content,
                    versionId,
                })
                .then(onSuccess)
                .catch(onError);
            return;
        }

        chatApi
            .sendMessage({
                conversationId: get().conversationId ?? undefined,
                content,
            })
            .then(onSuccess)
            .catch(onError);
    },

    reset: () =>
        set({
            status: "closed",
            messages: [],
            inputDraft: "",
            activeChatId: null,
            isStreaming: false,
            conversationId: null,
        }),
}));
