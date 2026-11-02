import {
  AI_DIFFICULTIES,
  AI_LANGUAGES,
  AI_QUESTION_TYPES,
  type AdminAiModelsResponse,
  type AdminAiSettingsResponse,
  type AiGenerateQuizzResponse,
  type AiStatusResponse,
} from "@razzia/common/types/ai"
import type { SessionResponse } from "@razzia/common/types/auth"
import { app } from "@razzia/socket/app"
import { getPath, initConfig } from "@razzia/socket/services/config"
import { setIo } from "@razzia/socket/services/io"
import { resetRateLimits } from "@razzia/socket/services/rate-limit"
import { createFakeIo } from "@razzia/socket/test/fake-io"
import fs from "fs"
import { StatusCodes } from "http-status-codes"
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

interface RequestOptions {
  method?: string
  token?: string
  body?: unknown
}

const request = (
  path: string,
  { method = "GET", token, body }: RequestOptions = {},
): Promise<Response> =>
  Promise.resolve(
    app.request(`/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )

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
  vi.restoreAllMocks()
  delete process.env.ENABLE_RATE_LIMIT_TEST
})

const loginAsAdmin = async () => {
  const res = await request("/auth/login", {
    method: "POST",
    body: { username: "admin", password: "test-password" },
  })
  expect(res.status).toBe(StatusCodes.OK)

  return json<SessionResponse>(res)
}

const createAndLoginTeacher = async (adminToken: string) => {
  const created = await request("/admin/users", {
    method: "POST",
    token: adminToken,
    body: {
      username: "gv.cntt",
      displayName: "Giảng viên CNTT",
      password: "TeacherPassword123!",
      role: "manager",
    },
  })
  expect(created.status).toBe(StatusCodes.CREATED)

  const loginRes = await request("/auth/login", {
    method: "POST",
    body: { username: "gv.cntt", password: "TeacherPassword123!" },
  })
  expect(loginRes.status).toBe(StatusCodes.OK)

  return json<SessionResponse>(loginRes)
}

describe("AI Question Generator & Admin AI Provider settings", () => {
  it("allows Super Admin to configure AI provider, masks API key, and preserves key across partial updates", async () => {
    const admin = await loginAsAdmin()
    const rawSecret = "sk-testSecretKeyForUnitTestingOnly9999"

    const patchRes = await request("/admin/ai", {
      method: "PATCH",
      token: admin.token,
      body: {
        enabled: true,
        baseUrl: "http://152.67.112.145:8317/v1/",
        apiKey: rawSecret,
        model: "gemini-3-flash-preview",
      },
    })
    expect(patchRes.status).toBe(StatusCodes.OK)
    const updated = await json<AdminAiSettingsResponse>(patchRes)

    expect(updated.enabled).toBe(true)
    expect(updated.baseUrl).toBe("http://152.67.112.145:8317/v1")
    expect(updated.model).toBe("gemini-3-flash-preview")
    expect(updated.hasApiKey).toBe(true)
    expect(updated.apiKeyMasked).toBe("sk-...9999")
    expect(JSON.stringify(updated)).not.toContain(rawSecret)

    // Updating model without resending apiKey preserves stored apiKey
    const switchModelRes = await request("/admin/ai", {
      method: "PATCH",
      token: admin.token,
      body: {
        enabled: true,
        baseUrl: "http://152.67.112.145:8317/v1",
        model: "claude-sonnet-4-6",
      },
    })
    expect(switchModelRes.status).toBe(StatusCodes.OK)
    const switched = await json<AdminAiSettingsResponse>(switchModelRes)
    expect(switched.model).toBe("claude-sonnet-4-6")
    expect(switched.hasApiKey).toBe(true)
    expect(switched.apiKeyMasked).toBe("sk-...9999")
  })

  it("blocks SSRF cloud metadata URLs and enforces strict Admin vs Manager RBAC", async () => {
    const admin = await loginAsAdmin()
    const teacher = await createAndLoginTeacher(admin.token)

    const unsafeUrls = [
      "http://169.254.169.254/latest/meta-data/",
      "http://metadata.google.internal/computeMetadata/v1",
      "file:///etc/passwd",
      "http://admin:secret@152.67.112.145:8317/v1",
    ]

    const badResponses = await Promise.all(
      unsafeUrls.map((unsafeUrl) =>
        request("/admin/ai", {
          method: "PATCH",
          token: admin.token,
          body: {
            enabled: true,
            baseUrl: unsafeUrl,
            apiKey: "sk-1234567890",
            model: "gemini-3-flash-preview",
          },
        }),
      ),
    )

    for (const badRes of badResponses) {
      expect(badRes.status).toBe(StatusCodes.BAD_REQUEST)
    }

    const forbiddenGet = await request("/admin/ai", {
      token: teacher.token,
    })
    expect(forbiddenGet.status).toBe(StatusCodes.FORBIDDEN)

    const forbiddenPatch = await request("/admin/ai", {
      method: "PATCH",
      token: teacher.token,
      body: {
        enabled: false,
        baseUrl: "https://api.openai.com/v1",
        model: "gemini-3-flash-preview",
      },
    })
    expect(forbiddenPatch.status).toBe(StatusCodes.FORBIDDEN)
  })

  it("fetches available chat models from upstream /models while filtering out image/embedding models", async () => {
    const admin = await loginAsAdmin()

    await request("/admin/ai", {
      method: "PATCH",
      token: admin.token,
      body: {
        enabled: true,
        baseUrl: "http://152.67.112.145:8317/v1",
        apiKey: "sk-mockKeyForModels1234",
        model: "gemini-3-flash-preview",
      },
    })

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            { id: "gpt-image-1.5" },
            { id: "claude-sonnet-4-6" },
            { id: "gemini-3-flash-preview" },
            { id: "gemini-3.1-flash-image" },
            { id: "text-embedding-3-small" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )

    const modelsRes = await request("/admin/ai/models", {
      method: "POST",
      token: admin.token,
      body: {},
    })
    expect(modelsRes.status).toBe(StatusCodes.OK)
    const body = await json<AdminAiModelsResponse>(modelsRes)

    expect(body.models).toEqual(["gemini-3-flash-preview", "claude-sonnet-4-6"])
  })

  it("generates validated single, multi, and estimation questions for lecturers via /api/ai/generate", async () => {
    const admin = await loginAsAdmin()
    const teacher = await createAndLoginTeacher(admin.token)

    await request("/admin/ai", {
      method: "PATCH",
      token: admin.token,
      body: {
        enabled: true,
        baseUrl: "http://152.67.112.145:8317/v1",
        apiKey: "sk-mockKeyForGenerate1234",
        model: "gemini-3-flash-preview",
      },
    })

    const statusRes = await request("/ai/status", { token: teacher.token })
    expect(statusRes.status).toBe(StatusCodes.OK)
    await expect(json<AiStatusResponse>(statusRes)).resolves.toEqual({
      enabled: true,
      model: "gemini-3-flash-preview",
    })

    const upstreamChatPayload = {
      choices: [
        {
          message: {
            content: [
              "```json",
              JSON.stringify({
                subject: "Sinh học Thực vật Đại cương",
                questions: [
                  {
                    type: "single",
                    question: "Bào quan nào thực hiện quang hợp ở lá cây?",
                    answers: [
                      "A. Lục lạp",
                      "B. Ti thể",
                      "C. Ribosome",
                      "D. Lysosome",
                    ],
                    solutions: [0],
                    note: "Lục lạp chứa sắc tố diệp lục hấp thụ ánh sáng.",
                    category: "Tế bào học",
                  },
                  {
                    type: "multi",
                    question:
                      "Nguyên tố nào thuộc nhóm dinh dưỡng đa lượng NPK?",
                    answers: [
                      "Nitơ (N)",
                      "Photpho (P)",
                      "Chì (Pb)",
                      "Kali (K)",
                    ],
                    solutions: ["A", "B", "D"],
                    note: "N, P, K là ba nguyên tố đa lượng thiết yếu.",
                  },
                  {
                    type: "estimation",
                    question:
                      "Tỷ lệ khí Nitơ (N2) trong khí quyển Trái Đất là bao nhiêu phần trăm?",
                    answers: [],
                    solutions: [78],
                    options: {
                      inputMode: "slider",
                      min: 0,
                      max: 100,
                      step: 1,
                      margin: 2,
                    },
                  },
                ],
              }),
              "```",
            ].join("\n"),
          },
        },
      ],
    }

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(upstreamChatPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    const genRes = await request("/ai/generate", {
      method: "POST",
      token: teacher.token,
      body: {
        topic: "Quang hợp và dinh dưỡng khoáng ở thực vật",
        sourceText: "Bài giảng chương 2: Lục lạp và vai trò của N, P, K.",
        count: 3,
        questionType: AI_QUESTION_TYPES.MIXED,
        difficulty: AI_DIFFICULTIES.BLOOM,
        time: 20,
        language: AI_LANGUAGES.VI,
      },
    })

    expect(genRes.status).toBe(StatusCodes.OK)
    const generated = await json<AiGenerateQuizzResponse>(genRes)
    expect(generated.model).toBe("gemini-3-flash-preview")
    expect(generated.quizz.subject).toBe("Sinh học Thực vật Đại cương")
    expect(generated.questions).toHaveLength(3)
    expect(generated.questions[0].answers[0]).toBe("Lục lạp")
    expect(generated.questions[1].solutions).toEqual([0, 1, 3])
    expect(generated.questions[2].type).toBe("estimation")
    expect(generated.questions[2].solutions).toEqual([78])

    // Disabling AI blocks /api/ai/generate cleanly
    await request("/admin/ai", {
      method: "PATCH",
      token: admin.token,
      body: {
        enabled: false,
        baseUrl: "http://152.67.112.145:8317/v1",
        model: "gemini-3-flash-preview",
      },
    })

    const disabledRes = await request("/ai/generate", {
      method: "POST",
      token: teacher.token,
      body: {
        topic: "Thử khi AI tắt",
        count: 2,
        questionType: AI_QUESTION_TYPES.SINGLE,
        difficulty: AI_DIFFICULTIES.EASY,
        time: 20,
        language: AI_LANGUAGES.VI,
      },
    })
    expect(disabledRes.status).toBe(StatusCodes.FORBIDDEN)
  })
})
