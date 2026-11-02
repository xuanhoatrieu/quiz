import type { Quizz } from "@razzia/common/types/game"
import { create } from "zustand"

interface QuizzDraftState {
  draft: Quizz | null
  setDraft: (_draft: Quizz | null) => void
}

export const useQuizzDraftStore = create<QuizzDraftState>((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
}))
