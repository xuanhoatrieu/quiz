import type { Question, Quizz } from "@razzia/common/types/game"

export const AI_QUESTION_TYPES = {
  MIXED: "mixed",
  SINGLE: "single",
  MULTI: "multi",
  ESTIMATION: "estimation",
} as const

export type AiQuestionTypeFilter =
  (typeof AI_QUESTION_TYPES)[keyof typeof AI_QUESTION_TYPES]

export const AI_DIFFICULTIES = {
  BLOOM: "bloom",
  EASY: "easy",
  MEDIUM: "medium",
  HARD: "hard",
} as const

export type AiDifficulty =
  (typeof AI_DIFFICULTIES)[keyof typeof AI_DIFFICULTIES]

export const AI_LANGUAGES = {
  VI: "vi",
  EN: "en",
} as const

export type AiLanguage = (typeof AI_LANGUAGES)[keyof typeof AI_LANGUAGES]

export interface AiStatusResponse {
  enabled: boolean
  model: string
}

export interface AdminAiSettingsResponse {
  enabled: boolean
  baseUrl: string
  model: string
  hasApiKey: boolean
  apiKeyMasked: string
}

export interface AdminAiModelsResponse {
  models: string[]
}

export interface AiGenerateQuizzInput {
  topic: string
  sourceText?: string
  count: number
  questionType: AiQuestionTypeFilter
  difficulty: AiDifficulty
  time: number
  language: AiLanguage
}

export interface AiGenerateQuizzResponse {
  quizz: Quizz
  questions: Question[]
  model: string
}
