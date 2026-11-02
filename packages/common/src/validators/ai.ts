import {
  AI_DIFFICULTIES,
  AI_LANGUAGES,
  AI_QUESTION_TYPES,
} from "@razzia/common/types/ai"
import z from "zod"

const BLOCKED_METADATA_HOSTS = new Set([
  "169.254.169.254",
  "100.100.100.200",
  "0.0.0.0",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
])

export const isSafeAiBaseUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value.trim())

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false
    }

    if (parsed.username.length > 0 || parsed.password.length > 0) {
      return false
    }

    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "")

    if (
      BLOCKED_METADATA_HOSTS.has(host) ||
      host.startsWith("169.254.") ||
      host === "::" ||
      host.startsWith("fe80:")
    ) {
      return false
    }

    return host.length > 0
  } catch {
    return false
  }
}

export const aiBaseUrlValidator = z
  .string()
  .trim()
  .min(1, "errors:ai.invalidBaseUrl")
  .max(300, "errors:ai.invalidBaseUrl")
  .refine((val) => isSafeAiBaseUrl(val), "errors:ai.invalidBaseUrl")

export const adminUpdateAiSettingsValidator = z.object({
  enabled: z.boolean(),
  baseUrl: z
    .string()
    .trim()
    .max(300, "errors:ai.invalidBaseUrl")
    .refine(
      (val) => val.length === 0 || isSafeAiBaseUrl(val),
      "errors:ai.invalidBaseUrl",
    ),
  apiKey: z.string().trim().max(512).optional(),
  clearApiKey: z.boolean().optional(),
  model: z.string().trim().max(128),
})

export const adminFetchAiModelsValidator = z.object({
  baseUrl: aiBaseUrlValidator.optional(),
  apiKey: z.string().trim().max(512).optional(),
})

export const aiGenerateQuizzValidator = z.object({
  topic: z
    .string()
    .trim()
    .min(2, "errors:ai.topicTooShort")
    .max(300, "errors:ai.topicTooShort"),
  sourceText: z
    .string()
    .trim()
    .max(12000, "errors:ai.sourceTooLong")
    .optional(),
  count: z
    .number()
    .int()
    .min(1, "errors:ai.invalidCount")
    .max(20, "errors:ai.invalidCount"),
  questionType: z.enum(AI_QUESTION_TYPES),
  difficulty: z.enum(AI_DIFFICULTIES),
  time: z.number().int().min(5).max(300),
  language: z.enum(AI_LANGUAGES),
})
