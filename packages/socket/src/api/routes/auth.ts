import { zValidator } from "@hono/zod-validator"
import { isManagerRole, SESSION_ROLES } from "@razzia/common/constants"
import type { SessionResponse } from "@razzia/common/types/auth"
import {
  accountLoginValidator,
  accountRegisterValidator,
  changePasswordValidator,
  managerLoginValidator,
  sessionRequestValidator,
} from "@razzia/common/validators/auth"
import { apiFactory } from "@razzia/socket/api/factory"
import {
  readClaims,
  requireManager,
  verifyActiveClaims,
} from "@razzia/socket/api/middleware"
import { i18nHook } from "@razzia/socket/api/validation"
import { managerPassword } from "@razzia/socket/env"
import {
  mintToken,
  newClientId,
  verifyIgnoringExpiry,
  verifyToken,
} from "@razzia/socket/services/auth"
import { constantTimeStringEquals } from "@razzia/socket/services/password"
import { checkAuthRateLimit } from "@razzia/socket/services/rate-limit"
import {
  authenticateAccount,
  changeAccountPassword,
  getInviteSettings,
  registerTeacherWithInvite,
  revokeUserSessions,
} from "@razzia/socket/services/store"
import { type Context } from "hono"
import { JwtTokenExpired } from "hono/utils/jwt/types"
import { StatusCodes } from "http-status-codes"

const readRequestToken = async (c: Context): Promise<string | undefined> => {
  try {
    const result = sessionRequestValidator.safeParse(await c.req.json())

    if (result.success && result.data.token) {
      return result.data.token
    }
  } catch {
    /* Empty */
  }

  const header = c.req.header("Authorization")

  return header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : undefined
}

const freshPlayerSession = (): Promise<SessionResponse> =>
  mintToken(newClientId(), SESSION_ROLES.PLAYER)

const routes = apiFactory
  .createApp()
  .get("/invite-status", async (c) => {
    const settings = await getInviteSettings()

    return c.json({ enabled: settings.enabled })
  })
  .post("/session", async (c) => {
    const token = await readRequestToken(c)

    if (!token) {
      return c.json(await freshPlayerSession())
    }

    try {
      const rawClaims = await verifyToken(token)

      if (isManagerRole(rawClaims.role) && rawClaims.ver !== undefined) {
        const activeClaims = await verifyActiveClaims(token)

        if (!activeClaims) {
          return c.json(await freshPlayerSession())
        }

        return c.json({
          token,
          clientId: activeClaims.sub,
          role: activeClaims.role,
          expiresAt: activeClaims.exp,
          ...(activeClaims.username ? { username: activeClaims.username } : {}),
          ...(activeClaims.displayName
            ? { displayName: activeClaims.displayName }
            : {}),
        } satisfies SessionResponse)
      }

      return c.json({
        token,
        clientId: rawClaims.sub,
        role: rawClaims.role,
        expiresAt: rawClaims.exp,
      } satisfies SessionResponse)
    } catch (error) {
      if (error instanceof JwtTokenExpired) {
        try {
          const claims = await verifyIgnoringExpiry(token)

          if (claims.ver !== undefined) {
            return c.json(await freshPlayerSession())
          }

          return c.json(await mintToken(claims.sub, SESSION_ROLES.PLAYER))
        } catch {
          /* Empty */
        }
      }

      return c.json(await freshPlayerSession())
    }
  })
  .post(
    "/login",
    zValidator("json", accountLoginValidator, i18nHook),
    async (c) => {
      checkAuthRateLimit(c, "login")
      const { username, password } = c.req.valid("json")
      const user = await authenticateAccount(username, password)

      return c.json(
        await mintToken(user.id, user.role, {
          ver: user.sessionVersion,
          username: user.username,
          displayName: user.displayName,
        }),
      )
    },
  )
  .post(
    "/register",
    zValidator("json", accountRegisterValidator, i18nHook),
    async (c) => {
      checkAuthRateLimit(c, "register", 10)
      const user = await registerTeacherWithInvite(c.req.valid("json"))

      return c.json(
        await mintToken(user.id, user.role, {
          ver: user.sessionVersion,
          username: user.username,
          displayName: user.displayName,
        }),
        StatusCodes.CREATED,
      )
    },
  )
  .post(
    "/password",
    requireManager,
    zValidator("json", changePasswordValidator, i18nHook),
    async (c) => {
      const claims = c.get("claims")
      const { currentPassword, newPassword } = c.req.valid("json")
      const updated = await changeAccountPassword(
        claims.sub,
        currentPassword,
        newPassword,
      )

      return c.json(
        await mintToken(updated.id, updated.role, {
          ver: updated.sessionVersion,
          username: updated.username,
          displayName: updated.displayName,
        }),
      )
    },
  )
  .post(
    "/manager",
    zValidator("json", managerLoginValidator, i18nHook),
    async (c) => {
      checkAuthRateLimit(c, "manager")
      const { password } = c.req.valid("json")

      if (!managerPassword) {
        return c.json(
          { error: "errors:manager.passwordNotConfigured" },
          StatusCodes.FORBIDDEN,
        )
      }

      if (!constantTimeStringEquals(password, managerPassword)) {
        return c.json(
          { error: "errors:manager.invalidPassword" },
          StatusCodes.FORBIDDEN,
        )
      }

      const claims = await readClaims(c)

      return c.json(
        await mintToken(claims?.sub ?? newClientId(), SESSION_ROLES.MANAGER),
      )
    },
  )
  .post("/logout", async (c) => {
    const claims = await readClaims(c)

    if (!claims) {
      return c.json(
        { error: "errors:auth.unauthorized" },
        StatusCodes.UNAUTHORIZED,
      )
    }

    if (claims.ver !== undefined) {
      await revokeUserSessions(claims.sub)

      return c.json(await freshPlayerSession())
    }

    return c.json(await mintToken(claims.sub, SESSION_ROLES.PLAYER))
  })

export const auth = routes
