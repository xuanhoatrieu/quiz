import type { ACCOUNT_ROLES, SESSION_ROLES } from "@razzia/common/constants"

export type SessionRole = (typeof SESSION_ROLES)[keyof typeof SESSION_ROLES]

export type AccountRole = (typeof ACCOUNT_ROLES)[keyof typeof ACCOUNT_ROLES]

export interface SessionClaims {
  sub: string
  role: SessionRole
  ver?: number
  username?: string
  displayName?: string
  iat: number
  exp: number
}

export interface SessionResponse {
  token: string
  clientId: string
  role: SessionRole
  expiresAt: number
  username?: string
  displayName?: string
}

export interface JoinTicketClaims {
  sub: string
  gameId: string
  username?: string
  iat: number
  exp: number
}

export interface UserSummary {
  id: string
  username: string
  displayName: string
  role: AccountRole
  active: boolean
  createdAt: string
}

export interface InviteSettings {
  enabled: boolean
  code: string
}
