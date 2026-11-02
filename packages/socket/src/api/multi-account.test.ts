import { QUIZZ_MODES, SESSION_ROLES } from "@razzia/common/constants"
import type {
  InviteSettings,
  SessionResponse,
  UserSummary,
} from "@razzia/common/types/auth"
import type {
  GameResultMeta,
  QuizzWithId,
  UploadedMedia,
} from "@razzia/common/types/game"
import { app } from "@razzia/socket/app"
import { getPath, initConfig } from "@razzia/socket/services/config"
import { setIo } from "@razzia/socket/services/io"
import { resetRateLimits } from "@razzia/socket/services/rate-limit"
import Registry from "@razzia/socket/services/registry"
import { recordResultForOwner } from "@razzia/socket/services/store"
import { createFakeIo } from "@razzia/socket/test/fake-io"
import { createQuestion, createQuizz } from "@razzia/socket/test/fixtures"
import fs from "fs"
import { StatusCodes } from "http-status-codes"
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

interface RequestOptions {
  method?: string
  token?: string
  body?: unknown
  headers?: Record<string, string>
}

const request = (
  path: string,
  { method = "GET", token, body, headers }: RequestOptions = {},
): Promise<Response> =>
  Promise.resolve(
    app.request(`/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )

const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000",
  "hex",
)

const uploadMedia = (token: string, filename = "slide.png") => {
  const form = new FormData()
  form.append("file", new File([PNG_BYTES], filename, { type: "image/png" }))

  return app.request("/api/media", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
}

const json = async <T = Record<string, unknown>>(response: Response) =>
  (await response.json()) as T

beforeAll(() => {
  setIo(createFakeIo().io)
})

beforeEach(() => {
  resetRateLimits()
  delete process.env.ENABLE_RATE_LIMIT_TEST
  fs.rmSync(getPath(), { recursive: true, force: true })
  initConfig()
})

afterEach(() => {
  delete process.env.ENABLE_RATE_LIMIT_TEST
  Registry.getInstance()
    .getAllGames()
    .forEach((game) => {
      Registry.getInstance().removeGame(game.gameId)
    })
})

const loginAsAdmin = async () => {
  const res = await request("/auth/login", {
    method: "POST",
    body: { username: "admin", password: "test-password" },
  })

  expect(res.status).toBe(StatusCodes.OK)

  return json<SessionResponse>(res)
}

describe("multi-account & production health", () => {
  it("exposes GET /health for container and reverse-proxy healthchecks", async () => {
    const res = await app.request("/health")

    expect(res.status).toBe(StatusCodes.OK)
    await expect(json(res)).resolves.toEqual({
      status: "healthy",
      version: "4.0.2",
    })
  })

  it("authenticates bootstrap super admin and rejects wrong credentials", async () => {
    const bad = await request("/auth/login", {
      method: "POST",
      body: { username: "admin", password: "wrong-password" },
    })

    expect(bad.status).toBe(StatusCodes.FORBIDDEN)
    await expect(json(bad)).resolves.toEqual({
      error: "errors:auth.invalidCredentials",
    })

    const session = await loginAsAdmin()

    expect(session.role).toBe(SESSION_ROLES.ADMIN)
    expect(session.username).toBe("admin")
  })

  it("supports admin invite code toggle and lecturer self-registration", async () => {
    const initialStatus = await json<{ enabled: boolean }>(
      await request("/auth/invite-status"),
    )
    expect(initialStatus.enabled).toBe(false)

    const blockedReg = await request("/auth/register", {
      method: "POST",
      body: {
        username: "gv.hoa",
        displayName: "TS. Nguyễn Xuân Hòa",
        password: "Password@123",
        inviteCode: "TUAF2026",
      },
    })
    expect(blockedReg.status).toBe(StatusCodes.FORBIDDEN)
    await expect(json(blockedReg)).resolves.toEqual({
      error: "errors:auth.inviteDisabled",
    })

    const admin = await loginAsAdmin()
    const inviteRes = await request("/admin/invite", {
      method: "PATCH",
      token: admin.token,
      body: { enabled: true, code: "TUAF2026" },
    })
    expect(inviteRes.status).toBe(StatusCodes.OK)
    await expect(json<InviteSettings>(inviteRes)).resolves.toEqual({
      enabled: true,
      code: "TUAF2026",
    })

    const wrongCode = await request("/auth/register", {
      method: "POST",
      body: {
        username: "gv.hoa",
        displayName: "TS. Nguyễn Xuân Hòa",
        password: "Password@123",
        inviteCode: "WRONGCODE",
      },
    })
    expect(wrongCode.status).toBe(StatusCodes.FORBIDDEN)
    await expect(json(wrongCode)).resolves.toEqual({
      error: "errors:auth.teacherInviteInvalid",
    })

    const created = await request("/auth/register", {
      method: "POST",
      body: {
        username: "gv.hoa",
        displayName: "TS. Nguyễn Xuân Hòa",
        password: "Password@123",
        inviteCode: "TUAF2026",
      },
    })
    expect(created.status).toBe(StatusCodes.CREATED)
    const teacherSession = await json<SessionResponse>(created)
    expect(teacherSession.role).toBe(SESSION_ROLES.MANAGER)
    expect(teacherSession.username).toBe("gv.hoa")
    expect(teacherSession.displayName).toBe("TS. Nguyễn Xuân Hòa")

    const duplicate = await request("/auth/register", {
      method: "POST",
      body: {
        username: "GV.HOA",
        displayName: "Trùng Tên",
        password: "Password@123",
        inviteCode: "TUAF2026",
      },
    })
    expect(duplicate.status).toBe(StatusCodes.CONFLICT)
    await expect(json(duplicate)).resolves.toEqual({
      error: "errors:auth.usernameTaken",
    })
  })

  it("rotates session_version on password change and revokes old tokens", async () => {
    const admin = await loginAsAdmin()
    const createRes = await request("/admin/users", {
      method: "POST",
      token: admin.token,
      body: {
        username: "lecturer1",
        displayName: "Giảng viên 1",
        password: "OldPassword123",
        role: SESSION_ROLES.MANAGER,
      },
    })
    expect(createRes.status).toBe(StatusCodes.CREATED)

    const loginRes = await json<SessionResponse>(
      await request("/auth/login", {
        method: "POST",
        body: { username: "lecturer1", password: "OldPassword123" },
      }),
    )

    const changedRes = await request("/auth/password", {
      method: "POST",
      token: loginRes.token,
      body: {
        currentPassword: "OldPassword123",
        newPassword: "NewPassword456",
      },
    })
    expect(changedRes.status).toBe(StatusCodes.OK)
    const newSession = await json<SessionResponse>(changedRes)

    const oldTokenCheck = await request("/quizz", { token: loginRes.token })
    expect(oldTokenCheck.status).toBe(StatusCodes.UNAUTHORIZED)

    const newTokenCheck = await request("/quizz", { token: newSession.token })
    expect(newTokenCheck.status).toBe(StatusCodes.OK)
  })

  it("enforces admin RBAC, self-modification guards, and deactivation token revocation", async () => {
    const admin = await loginAsAdmin()
    const createdUserRes = await json<{ user: UserSummary }>(
      await request("/admin/users", {
        method: "POST",
        token: admin.token,
        body: {
          username: "lecturer2",
          displayName: "Giảng viên 2",
          password: "Password@123",
          role: SESSION_ROLES.MANAGER,
        },
      }),
    )

    const teacherSession = await json<SessionResponse>(
      await request("/auth/login", {
        method: "POST",
        body: { username: "lecturer2", password: "Password@123" },
      }),
    )

    const nonAdminAttempt = await request("/admin/users", {
      token: teacherSession.token,
    })
    expect(nonAdminAttempt.status).toBe(StatusCodes.FORBIDDEN)

    const selfDelete = await request(`/admin/users/${admin.clientId}`, {
      method: "DELETE",
      token: admin.token,
    })
    expect(selfDelete.status).toBe(StatusCodes.BAD_REQUEST)
    await expect(json(selfDelete)).resolves.toEqual({
      error: "errors:admin.cannotModifySelf",
    })

    const disableRes = await request(`/admin/users/${createdUserRes.user.id}`, {
      method: "PATCH",
      token: admin.token,
      body: { active: false },
    })
    expect(disableRes.status).toBe(StatusCodes.OK)

    const revokedAccess = await request("/quizz", {
      token: teacherSession.token,
    })
    expect(revokedAccess.status).toBe(StatusCodes.UNAUTHORIZED)

    const disabledLogin = await request("/auth/login", {
      method: "POST",
      body: { username: "lecturer2", password: "Password@123" },
    })
    expect(disabledLogin.status).toBe(StatusCodes.FORBIDDEN)
    await expect(json(disabledLogin)).resolves.toEqual({
      error: "errors:auth.accountDisabled",
    })
  })

  it("strictly isolates quizzes, games, results, and media between lecturers", async () => {
    const admin = await loginAsAdmin()

    await Promise.all(
      [
        ["teacher.a", "Giảng viên A"],
        ["teacher.b", "Giảng viên B"],
      ].map(([username, displayName]) =>
        request("/admin/users", {
          method: "POST",
          token: admin.token,
          body: {
            username,
            displayName,
            password: "Password@123",
            role: SESSION_ROLES.MANAGER,
          },
        }),
      ),
    )

    const sessionA = await json<SessionResponse>(
      await request("/auth/login", {
        method: "POST",
        body: { username: "teacher.a", password: "Password@123" },
      }),
    )
    const sessionB = await json<SessionResponse>(
      await request("/auth/login", {
        method: "POST",
        body: { username: "teacher.b", password: "Password@123" },
      }),
    )

    // Quiz isolation
    const quizResA = await request("/quizz", {
      method: "POST",
      token: sessionA.token,
      body: { ...createQuizz([createQuestion()]), subject: "Đề của A" },
    })
    expect(quizResA.status).toBe(StatusCodes.CREATED)
    const quizA = await json<{ id: string }>(quizResA)

    const listB = await json<{ quizz: QuizzWithId[] }>(
      await request("/quizz", { token: sessionB.token }),
    )
    expect(listB.quizz).toEqual([])

    const readCrossQuiz = await request(`/quizz/${quizA.id}`, {
      token: sessionB.token,
    })
    expect(readCrossQuiz.status).toBe(StatusCodes.NOT_FOUND)

    const deleteCrossQuiz = await request(`/quizz/${quizA.id}`, {
      method: "DELETE",
      token: sessionB.token,
    })
    expect(deleteCrossQuiz.status).toBe(StatusCodes.NOT_FOUND)

    // Game launch isolation
    const crossGame = await request("/games", {
      method: "POST",
      token: sessionB.token,
      body: { quizzId: quizA.id },
    })
    expect(crossGame.status).toBe(StatusCodes.NOT_FOUND)

    // Results isolation
    const resultId = "result-teacher-a-1"
    await recordResultForOwner(
      {
        id: resultId,
        subject: "Kết quả lớp A",
        gameMode: QUIZZ_MODES.QUIZ,
        date: new Date().toISOString(),
        players: [],
        questions: [],
      },
      sessionA.clientId,
    )

    const resultsB = await json<{ results: GameResultMeta[] }>(
      await request("/results", { token: sessionB.token }),
    )
    expect(resultsB.results).toEqual([])

    const crossResultGet = await request(`/results/${resultId}`, {
      token: sessionB.token,
    })
    expect(crossResultGet.status).toBe(StatusCodes.NOT_FOUND)

    // Media isolation
    const mediaResA = await uploadMedia(sessionA.token)
    expect(mediaResA.status).toBe(StatusCodes.CREATED)
    const uploadedA = await json<UploadedMedia>(mediaResA)
    const filenameA = uploadedA.url.split("/").pop() ?? ""

    const mediaListB = await json<{ media: UploadedMedia[] }>(
      await request("/media", { token: sessionB.token }),
    )
    expect(mediaListB.media).toEqual([])

    const crossMediaDelete = await request(`/media/${filenameA}`, {
      method: "DELETE",
      token: sessionB.token,
    })
    expect(crossMediaDelete.status).toBe(StatusCodes.NOT_FOUND)
  })

  it("rate-limits repeated brute-force login attempts per IP", async () => {
    process.env.ENABLE_RATE_LIMIT_TEST = "1"

    const attempts = await Promise.all(
      Array.from({ length: 20 }, () =>
        request("/auth/login", {
          method: "POST",
          headers: { "x-real-ip": "203.0.113.42" },
          body: { username: "admin", password: "wrong" },
        }),
      ),
    )

    for (const attempt of attempts) {
      expect(attempt.status).toBe(StatusCodes.FORBIDDEN)
    }

    const throttled = await request("/auth/login", {
      method: "POST",
      headers: { "x-real-ip": "203.0.113.42" },
      body: { username: "admin", password: "wrong" },
    })
    expect(throttled.status).toBe(StatusCodes.TOO_MANY_REQUESTS)
    await expect(json(throttled)).resolves.toEqual({
      error: "errors:auth.tooManyAttempts",
    })
  })
})
