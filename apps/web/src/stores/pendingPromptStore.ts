import { create } from "zustand"
import { persist } from "zustand/middleware"

// Handoff for the marketing homepage hero chatbox (WorkspacePreview): a
// visitor types an idea while signed out, we stash it here (persisted to
// localStorage so it survives the redirect through /signin), then
// ChatHomeView reads and clears it once, right after login, to kick off the
// normal clarify flow with that text. Deliberately separate from
// useExtractStore/useClarifyStore — this store's only job is carrying one
// string across the auth redirect.
interface PendingPromptState {
  prompt: string
  setPrompt: (prompt: string) => void
  clear: () => void
}

export const usePendingPromptStore = create<PendingPromptState>()(
  persist(
    (set) => ({
      prompt: "",
      setPrompt: (prompt) => set({ prompt }),
      clear: () => set({ prompt: "" }),
    }),
    { name: "uf-pending-prompt" },
  ),
)
