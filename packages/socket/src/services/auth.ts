import { isManagerRole } from "@razzia/common/constants"
import type {
  JoinTicketClaims,
  SessionClaims,
  SessionResponse,
  SessionRole,
} from "@razzia/common/types/auth"
import {
  joinTicketClaimsValidator,
  sessionClaimsValidator,
} from "@razzia/common/validators/auth"
import { jwtSecret } from "@razzia/socket/env"
import { sign, verify } from "hono/jwt"
import { v7 as uuid } from "uuid"

const ALGORITHM = "HS256"
const PLAYER_TTL = 60 * 60 * 24 * 30
const MANAGER_TTL = 60 * 60 * 12

export const newClientId = (): string => uuid()

const parseClaims = (payload: unknown): SessionClaims => {
  const result = sessionClaimsValidator.safeParse(payload)

  if (!result.success) {
    throw new Error("Invalid session claims")
  }

  return result.data
}

export interface MintTokenOptions {
  ver?: number
  username?: string
  displayName?: string
}

export const mintToken = async (
  sub: string,
  role: SessionRole,
  options: MintTokenOptions = {},
): Promise<SessionResponse> => {
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + (isManagerRole(role) ? MANAGER_TTL : PLAYER_TTL)

  const payload: Record<string, unknown> = {
    sub,
    role,
    iat,
    exp,
    ...(options.ver !== undefined ? { ver: options.ver } : {}),
    ...(options.username ? { username: options.username } : {}),
    ...(options.displayName ? { displayName: options.displayName } : {}),
  }

  const token = await sign(payload, jwtSecret, ALGORITHM)

  return {
    token,
    clientId: sub,
    role,
    expiresAt: exp,
    ...(options.username ? { username: options.username } : {}),
    ...(options.displayName ? { displayName: options.displayName } : {}),
  }
}

export const verifyToken = async (token: string): Promise<SessionClaims> =>
  parseClaims(await verify(token, jwtSecret, ALGORITHM))

export const verifyIgnoringExpiry = async (
  token: string,
): Promise<SessionClaims> =>
  parseClaims(await verify(token, jwtSecret, { alg: ALGORITHM, exp: false }))

const JOIN_TICKET_TTL = 60 * 5

export const mintJoinTicket = (
  sub: string,
  gameId: string,
  username?: string,
): Promise<string> => {
  const iat = Math.floor(Date.now() / 1000)

  return sign(
    { sub, gameId, username, iat, exp: iat + JOIN_TICKET_TTL },
    jwtSecret,
    ALGORITHM,
  )
}

export const verifyJoinTicket = async (
  ticket: string,
): Promise<JoinTicketClaims> => {
  const result = joinTicketClaimsValidator.safeParse(
    await verify(ticket, jwtSecret, ALGORITHM),
  )

  if (!result.success) {
    throw new Error("Invalid join ticket")
  }

  return result.data
}
