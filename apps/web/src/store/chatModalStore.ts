import { create } from "zustand";

export type Role = "user" | "assistant";

export interface Message {
    id: string;
    role: Role;
    content: string;
    createdAt: Date;
}

export type ModalStatus = "closed" | "open" | "minimized";

interface ChatModalState {
    status: ModalStatus;
    messages: Message[];
    inputDraft: string;
    activeChatId: string | null;
    isStreaming: boolean;

    open: () => void;
    close: () => void;
    minimize: () => void;
    restore: () => void;
    sendMessage: (content: string) => void;
    setInputDraft: (v: string) => void;
    reset: () => void;
}

let msgCounter = 0;
const uid = () => `msg-${++msgCounter}-${Date.now()}`;

const MOCK_REPLIES: string[] = [
    "I can help with that! Let me think through the best approach for your workflow.",
    "Great question. Here's what I'd suggest based on your workspace context.",
    "Sure! I'll break this down into clear steps so it's easy to follow.",
    "Absolutely — let me pull up the relevant context and walk you through it.",
];

export const useChatModalStore = create<ChatModalState>((set, get) => ({
    status: "closed",
    messages: [],
    inputDraft: "",
    activeChatId: null,
    isStreaming: false,

    open: () => set({ status: "open" }),
    close: () => set({ status: "closed" }),
    minimize: () => set({ status: "minimized" }),
    restore: () => set({ status: "open" }),

    setInputDraft: (v) => set({ inputDraft: v }),

    sendMessage: (content) => {
        const userMsg: Message = {
            id: uid(),
            role: "user",
            content,
            createdAt: new Date(),
        };

        const chatId = get().activeChatId ?? `chat-${Date.now()}`;
        set((s) => ({
            messages: [...s.messages, userMsg],
            activeChatId: chatId,
            inputDraft: "",
            isStreaming: true,
        }));

        const reply = MOCK_REPLIES[Math.floor(Math.random() * MOCK_REPLIES.length)];
        const assistantId = uid();
        const assistantMsg: Message = {
            id: assistantId,
            role: "assistant",
            content: "",
            createdAt: new Date(),
        };

        set((s) => ({ messages: [...s.messages, assistantMsg] }));

        let i = 0;
        const interval = setInterval(() => {
            i++;
            const partial = reply.slice(0, i * 3);
            set((s) => ({
                messages: s.messages.map((m) =>
                    m.id === assistantId ? { ...m, content: partial } : m
                ),
            }));
            if (i * 3 >= reply.length) {
                clearInterval(interval);
                set((s) => ({
                    isStreaming: false,
                    messages: s.messages.map((m) =>
                        m.id === assistantId ? { ...m, content: reply } : m
                    ),
                }));
            }
        }, 30);
    },

    reset: () =>
        set({
            status: "closed",
            messages: [],
            inputDraft: "",
            activeChatId: null,
            isStreaming: false,
        }),
}));
