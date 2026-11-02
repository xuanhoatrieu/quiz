import { isManagerRole, SESSION_ROLES } from "@razzia/common/constants"
import type { SessionClaims } from "@razzia/common/types/auth"
import { type ApiEnv } from "@razzia/socket/api/factory"
import { verifyToken } from "@razzia/socket/services/auth"
import { validateSessionUser } from "@razzia/socket/services/store"
import type { Context } from "hono"
import { createMiddleware } from "hono/factory"
import { StatusCodes } from "http-status-codes"

const UNAUTHORIZED = { error: "errors:auth.unauthorized" } as const

const getBearerToken = (c: Context): string | undefined => {
  const header = c.req.header("Authorization")

  if (!header?.startsWith("Bearer ")) {
    return undefined
  }

  return header.slice("Bearer ".length)
}

export const verifyActiveClaims = async (
  token: string,
): Promise<SessionClaims | undefined> => {
  try {
    const claims = await verifyToken(token)

    if (isManagerRole(claims.role) && claims.ver !== undefined) {
      const user = await validateSessionUser(claims.sub, claims.ver)

      if (!user) {
        return undefined
      }

      return {
        ...claims,
        role: user.role,
        username: user.username,
        displayName: user.displayName,
      }
    }

    return claims
  } catch {
    return undefined
  }
}

export const readClaims = (c: Context): Promise<SessionClaims | undefined> => {
  const token = getBearerToken(c)

  if (!token) {
    return Promise.resolve(undefined)
  }

  return verifyActiveClaims(token)
}

export const requireSession = createMiddleware<ApiEnv>(async (c, next) => {
  const claims = await readClaims(c)

  if (!claims) {
    return c.json(UNAUTHORIZED, StatusCodes.UNAUTHORIZED)
  }

  c.set("claims", claims)

  await next()
})

export const requireManager = createMiddleware<ApiEnv>(async (c, next) => {
  const claims = await readClaims(c)

  if (!claims || !isManagerRole(claims.role)) {
    return c.json(UNAUTHORIZED, StatusCodes.UNAUTHORIZED)
  }

  c.set("claims", claims)

  await next()
})

export const requireAdmin = createMiddleware<ApiEnv>(async (c, next) => {
  const claims = await readClaims(c)

  if (!claims) {
    return c.json(UNAUTHORIZED, StatusCodes.UNAUTHORIZED)
  }

  if (claims.role !== SESSION_ROLES.ADMIN) {
    return c.json(UNAUTHORIZED, StatusCodes.FORBIDDEN)
  }

  c.set("claims", claims)

  await next()
})
