import { create } from "zustand"
import { persist } from "zustand/middleware"
import { MODELS, DEFAULT_MODEL_ID } from "@repo/schemas"
import type { ModelId, ModelMeta } from "@repo/schemas"

interface ModelState {
  selectedModelId: ModelId
  setModel: (id: ModelId) => void
  getSelectedModel: () => ModelMeta
}

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      selectedModelId: DEFAULT_MODEL_ID,
      setModel: (id) => set({ selectedModelId: id }),
      getSelectedModel: () =>
        MODELS.find((m) => m.id === get().selectedModelId) ?? MODELS[0]!,
    }),
    { name: "uf-model" },
  ),
)
