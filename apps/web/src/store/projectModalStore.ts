import { create } from "zustand";

interface ProjectModalState {
    isOpen: boolean;
    open: () => void;
    close: () => void;
}

export const useProjectModalStore = create<ProjectModalState>((set) => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
}));
