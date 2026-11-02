import { randomBytes } from "crypto"
import z from "zod"

const MIN_SECRET_LENGTH = 32

const optional = (schema: z.ZodString) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional())

const envSchema = z.object({
  DATABASE_URL: optional(z.string().min(1, "DATABASE_URL cannot be empty")),
  ADMIN_USERNAME: z.preprocess(
    (value) => (value === "" || value === undefined ? "admin" : value),
    z
      .string()
      .trim()
      .toLowerCase()
      .min(3, "ADMIN_USERNAME must be at least 3 characters")
      .max(48, "ADMIN_USERNAME cannot exceed 48 characters"),
  ),
  ADMIN_DISPLAY_NAME: z.preprocess(
    (value) => (value === "" || value === undefined ? "Administrator" : value),
    z.string().trim().min(1).max(64),
  ),
  ADMIN_PASSWORD: optional(z.string().min(1, "ADMIN_PASSWORD cannot be empty")),
  MANAGER_PASSWORD: optional(
    z.string().min(1, "MANAGER_PASSWORD cannot be empty"),
  ),
  TEACHER_INVITE_CODE: optional(
    z
      .string()
      .trim()
      .min(4, "TEACHER_INVITE_CODE must be at least 4 characters"),
  ),
  AI_BASE_URL: optional(
    z.string().trim().min(1, "AI_BASE_URL cannot be empty"),
  ),
  AI_API_KEY: optional(z.string().trim().min(1, "AI_API_KEY cannot be empty")),
  AI_MODEL: z.preprocess(
    (value) =>
      value === "" || value === undefined ? "gemini-3-flash-preview" : value,
    z.string().trim().min(1).max(128),
  ),
  JWT_SECRET: optional(
    z
      .string()
      .min(
        MIN_SECRET_LENGTH,
        `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`,
      ),
  ),
  MAX_MEDIA_SIZE_MB: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce
      .number()
      .positive("MAX_MEDIA_SIZE_MB must be a positive number")
      .default(100),
  ),
  GAME_SPEED: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce
      .number()
      .positive("GAME_SPEED must be a positive number")
      .default(1),
  ),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  throw new Error(
    `Invalid environment:\n${parsed.error.issues
      .map((issue) => `  - ${issue.message}`)
      .join("\n")}`,
  )
}

export const databaseUrl = parsed.data.DATABASE_URL

export const adminUsername = parsed.data.ADMIN_USERNAME

export const adminDisplayName = parsed.data.ADMIN_DISPLAY_NAME

export const managerPassword =
  parsed.data.ADMIN_PASSWORD ?? parsed.data.MANAGER_PASSWORD

export const teacherInviteCodeEnv = parsed.data.TEACHER_INVITE_CODE

export const aiBaseUrlEnv = parsed.data.AI_BASE_URL

export const aiApiKeyEnv = parsed.data.AI_API_KEY

export const aiModelEnv = parsed.data.AI_MODEL

export const maxMediaSizeBytes = Math.floor(
  parsed.data.MAX_MEDIA_SIZE_MB * 1024 * 1024,
)

export const gameSpeed = parsed.data.GAME_SPEED

if (!parsed.data.JWT_SECRET && process.env.NODE_ENV === "production") {
  console.warn(
    "[SECURITY WARNING] JWT_SECRET is not set. Generating ephemeral instance-isolated secret!",
  )
}

export const jwtSecret =
  parsed.data.JWT_SECRET ?? randomBytes(32).toString("hex")
