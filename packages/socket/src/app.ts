import type { ServerType } from "@hono/node-server"
import { EVENTS, isManagerRole } from "@razzia/common/constants"
import type { Server } from "@razzia/common/types/game/socket"
import { clientEventValidators } from "@razzia/common/validators/socket"
import { api } from "@razzia/socket/api"
import { gameSocketHandlers } from "@razzia/socket/handlers/game"
import type { SocketHandler } from "@razzia/socket/handlers/types"
import { verifyToken } from "@razzia/socket/services/auth"
import { pingDatabase } from "@razzia/socket/services/db"
import { DomainError } from "@razzia/socket/services/errors"
import { setIo } from "@razzia/socket/services/io"
import { validateSessionUser } from "@razzia/socket/services/store"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { JwtTokenExpired } from "hono/utils/jwt/types"
import { StatusCodes } from "http-status-codes"
import { Server as ServerIO } from "socket.io"
import type { z } from "zod"

const eventValidators: Partial<Record<string, z.ZodType>> =
  clientEventValidators

export const app = new Hono()

app.get("/health", async (c) => {
  const dbHealthy = await pingDatabase()

  if (!dbHealthy) {
    return c.json(
      { status: "unhealthy", version: "4.0.2" },
      StatusCodes.SERVICE_UNAVAILABLE,
    )
  }

  return c.json({ status: "healthy", version: "4.0.2" })
})

app.route("/api", api)

app.notFound((c) =>
  c.json({ error: "errors:api.notFound" }, StatusCodes.NOT_FOUND),
)

const HTTP_ERROR_KEYS: Partial<Record<number, string>> = {
  [StatusCodes.BAD_REQUEST]: "errors:invalidRequest",
  [StatusCodes.UNAUTHORIZED]: "errors:auth.unauthorized",
  [StatusCodes.FORBIDDEN]: "errors:auth.unauthorized",
  [StatusCodes.NOT_FOUND]: "errors:api.notFound",
}

app.onError((error, c) => {
  if (error instanceof DomainError) {
    if (error.status >= StatusCodes.INTERNAL_SERVER_ERROR) {
      console.error("API error:", error.key)
    }

    return c.json({ error: error.key }, error.status)
  }

  if (error instanceof HTTPException) {
    return c.json(
      { error: HTTP_ERROR_KEYS[error.status] ?? "errors:api.serverError" },
      error.status,
    )
  }

  console.error("Unhandled API error")

  return c.json(
    { error: "errors:api.serverError" },
    StatusCodes.INTERNAL_SERVER_ERROR,
  )
})

const socketHandlers: SocketHandler[] = [gameSocketHandlers]

const authError = (code: string, message: string) => {
  const error = new Error(message) as Error & { data: { code: string } }
  error.data = { code }

  return error
}

export const createSocketServer = (server: ServerType): Server => {
  const io: Server = new ServerIO(server, {
    path: "/ws",
    pingInterval: 25_000,
    pingTimeout: 60_000,
    perMessageDeflate: false,
  })

  setIo(io)

  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined

    if (!token) {
      next(authError("TOKEN_MISSING", "errors:auth.tokenMissing"))

      return
    }

    verifyToken(token)
      .then(async (claims) => {
        if (isManagerRole(claims.role) && claims.ver !== undefined) {
          const user = await validateSessionUser(claims.sub, claims.ver)

          if (!user) {
            next(authError("TOKEN_INVALID", "errors:auth.tokenInvalid"))

            return
          }

          socket.data = {
            clientId: user.id,
            role: user.role,
          }

          next()

          return
        }

        socket.data = {
          clientId: claims.sub,
          role: claims.role,
        }

        next()
      })
      .catch((error: unknown) => {
        const code =
          error instanceof JwtTokenExpired ? "TOKEN_EXPIRED" : "TOKEN_INVALID"

        next(authError(code, "errors:auth.tokenInvalid"))
      })
  })

  io.on("connection", (socket) => {
    console.log(
      `A user connected: socketId: ${socket.id}, clientId: ${socket.data.clientId}`,
    )

    socket.use((packet, next) => {
      const validator = eventValidators[packet[0]]

      if (!validator) {
        next()

        return
      }

      const result = validator.safeParse(packet[1])

      if (!result.success) {
        socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:invalidRequest")

        return
      }

      packet[1] = result.data
      next()
    })

    socketHandlers.forEach((handler) => {
      handler({ io, socket })
    })
  })

  return io
}
