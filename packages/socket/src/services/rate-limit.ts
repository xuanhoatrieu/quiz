import { tooManyRequests } from "@razzia/socket/services/errors"
import type { Context } from "hono"

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

const WINDOW_MS = 60 * 1000
const MAX_AUTH_ATTEMPTS = 20

export const getClientIp = (c: Context): string => {
  const realIp = c.req.header("x-real-ip")

  if (realIp) {
    return realIp.trim()
  }

  const forwarded = c.req.header("x-forwarded-for")

  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown"
  }

  return "local"
}

export const checkAuthRateLimit = (
  c: Context,
  scope = "auth",
  limit = MAX_AUTH_ATTEMPTS,
): void => {
  if (process.env.VITEST && process.env.ENABLE_RATE_LIMIT_TEST !== "1") {
    return
  }

  const now = Date.now()
  const key = `${scope}:${getClientIp(c)}`
  const current = buckets.get(key)

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })

    return
  }

  if (current.count >= limit) {
    throw tooManyRequests("errors:auth.tooManyAttempts")
  }

  current.count += 1
}

export const resetRateLimits = (): void => {
  buckets.clear()
}
