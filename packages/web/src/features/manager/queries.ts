import type { AiGenerateQuizzInput } from "@razzia/common/types/ai"
import type { AccountRole } from "@razzia/common/types/auth"
import type { GameSettings } from "@razzia/common/types/game"
import type { QuizzValidated } from "@razzia/common/validators/quizz"
import { api, unwrap, unwrapEmpty } from "@razzia/web/lib/api"
import { queryOptions } from "@tanstack/react-query"

export const quizzKeys = {
  all: ["quizz"] as const,
  detail: (id: string) => ["quizz", id] as const,
}

export const resultKeys = {
  all: ["results"] as const,
  detail: (id: string) => ["results", id] as const,
}

export const adminKeys = {
  users: ["admin", "users"] as const,
  invite: ["admin", "invite"] as const,
  inviteStatus: ["auth", "invite-status"] as const,
  ai: ["admin", "ai"] as const,
}

export const aiKeys = {
  status: ["ai", "status"] as const,
}

export const quizzListQuery = () =>
  queryOptions({
    queryKey: quizzKeys.all,
    queryFn: () => unwrap(api.quizz.$get()),
  })

export const quizzQuery = (id: string) =>
  queryOptions({
    queryKey: quizzKeys.detail(id),
    queryFn: () => unwrap(api.quizz[":id"].$get({ param: { id } })),
  })

export const resultsListQuery = () =>
  queryOptions({
    queryKey: resultKeys.all,
    queryFn: () => unwrap(api.results.$get()),
  })

export const resultQuery = (id: string) =>
  queryOptions({
    queryKey: resultKeys.detail(id),
    queryFn: () => unwrap(api.results[":id"].$get({ param: { id } })),
  })

export const inviteStatusQuery = () =>
  queryOptions({
    queryKey: adminKeys.inviteStatus,
    queryFn: () => unwrap(api.auth["invite-status"].$get()),
  })

export const adminUsersQuery = () =>
  queryOptions({
    queryKey: adminKeys.users,
    queryFn: () => unwrap(api.admin.users.$get()),
  })

export const adminInviteQuery = () =>
  queryOptions({
    queryKey: adminKeys.invite,
    queryFn: () => unwrap(api.admin.invite.$get()),
  })

export const adminAiQuery = () =>
  queryOptions({
    queryKey: adminKeys.ai,
    queryFn: () => unwrap(api.admin.ai.$get()),
  })

export const aiStatusQuery = () =>
  queryOptions({
    queryKey: aiKeys.status,
    queryFn: () => unwrap(api.ai.status.$get()),
  })

export const createQuizz = (json: QuizzValidated) =>
  unwrap(api.quizz.$post({ json }))

export const updateQuizz = ({
  id,
  json,
}: {
  id: string
  json: QuizzValidated
}) => unwrap(api.quizz[":id"].$patch({ param: { id }, json }))

export const deleteQuizz = (id: string) =>
  unwrapEmpty(api.quizz[":id"].$delete({ param: { id } }))

export const deleteResult = (id: string) =>
  unwrapEmpty(api.results[":id"].$delete({ param: { id } }))

export const createGame = (quizzId: string) =>
  unwrap(api.games.$post({ json: { quizzId } }))

export const updateGameSettings = ({
  gameId,
  json,
}: {
  gameId: string
  json: Partial<GameSettings>
}) => unwrap(api.games[":gameId"].settings.$patch({ param: { gameId }, json }))

export const managerLogin = (password: string) =>
  unwrap(api.auth.manager.$post({ json: { password } }))

export const accountLogin = (json: { username: string; password: string }) =>
  unwrap(api.auth.login.$post({ json }))

export const accountRegister = (json: {
  username: string
  displayName: string
  password: string
  inviteCode: string
}) => unwrap(api.auth.register.$post({ json }))

export const changeAccountPassword = (json: {
  currentPassword: string
  newPassword: string
}) => unwrap(api.auth.password.$post({ json }))

export const managerLogout = () => unwrap(api.auth.logout.$post())

export const adminCreateUser = (json: {
  username: string
  displayName: string
  password: string
  role: AccountRole
}) => unwrap(api.admin.users.$post({ json }))

export const adminUpdateUser = ({
  id,
  json,
}: {
  id: string
  json: {
    displayName?: string
    role?: AccountRole
    active?: boolean
    password?: string
  }
}) => unwrap(api.admin.users[":id"].$patch({ param: { id }, json }))

export const adminDeleteUser = (id: string) =>
  unwrapEmpty(api.admin.users[":id"].$delete({ param: { id } }))

export const adminUpdateInvite = (json: { enabled: boolean; code?: string }) =>
  unwrap(api.admin.invite.$patch({ json }))

export const adminUpdateAi = (json: {
  enabled: boolean
  baseUrl: string
  apiKey?: string
  clearApiKey?: boolean
  model: string
}) => unwrap(api.admin.ai.$patch({ json }))

export const adminFetchAiModels = (json: {
  baseUrl?: string
  apiKey?: string
}) => unwrap(api.admin.ai.models.$post({ json }))

export const generateAiQuizz = (json: AiGenerateQuizzInput) =>
  unwrap(api.ai.generate.$post({ json }))
