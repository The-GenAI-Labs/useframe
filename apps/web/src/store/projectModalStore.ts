import { create } from "zustand";
import type { StepId } from "@repo/schemas";

// One modal (BriefModal) serves every way into a project: the Create
// Project button, the home prompt box, and "Edit brief" on a project.
export type BriefModalRequest =
    | { mode: "create"; ideaText?: string }
    | { mode: "edit"; projectSlug: string; step?: StepId };

interface ProjectModalState {
    isOpen: boolean;
    request: BriefModalRequest;
    open: (request?: BriefModalRequest) => void;
    close: () => void;
}

function isRequest(value: unknown): value is BriefModalRequest {
    return !!value && typeof value === "object" && "mode" in value;
}

export const useProjectModalStore = create<ProjectModalState>((set) => ({
    isOpen: false,
    request: { mode: "create" },
    open: (request) => set({ isOpen: true, request: isRequest(request) ? request : { mode: "create" } }),
    close: () => set({ isOpen: false }),
}));
