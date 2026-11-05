import { createQuestion } from "@razzia/socket/test/fixtures"
import { normalizeFilename } from "@razzia/socket/utils/file"
import { orderToPoint, timeToPoint } from "@razzia/socket/utils/game"
import { createNickname } from "@razzia/socket/utils/nickname"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("orderToPoint", () => {
  it("gives full points to all players regardless of answer order", () => {
    expect(orderToPoint(0, 3)).toBe(1)
    expect(orderToPoint(1, 3)).toBe(1)
    expect(orderToPoint(2, 3)).toBe(1)
  })

  it("gives full custom points to a player", () => {
    expect(orderToPoint(0, 1, 200)).toBe(200)
  })
})

describe("timeToPoint", () => {
  it("gives full points when answered within the time limit and 0 after timeout", () => {
    vi.useFakeTimers()

    const question = createQuestion({ time: 10, maxPoints: 1 })
    const start = Date.now()

    expect(timeToPoint(start, question)).toBe(1)

    vi.advanceTimersByTime(9000)

    expect(timeToPoint(start, question)).toBe(1)

    vi.advanceTimersByTime(2000)

    expect(timeToPoint(start, question)).toBe(0)
  })
})

describe("createNickname", () => {
  it("adds a suffix when every generated name is taken", () => {
    vi.spyOn(Math, "random").mockReturnValue(0)

    expect(createNickname([])).toBe("Brave Badger")
    expect(createNickname(["Brave Badger", "Brave Badger 2"])).toBe(
      "Brave Badger 3",
    )
  })
})

describe("normalizeFilename", () => {
  it("builds a safe slug followed by a random id", () => {
    expect(normalizeFilename("Élève Été!", { fallback: "x" })).toMatch(
      /^eleve-ete-[\w-]{8}$/u,
    )
  })

  it("falls back when nothing usable is left", () => {
    expect(normalizeFilename("../../", { fallback: "quizz" })).toMatch(
      /^quizz-[\w-]{8}$/u,
    )
  })
})

describe("GAME_SPEED", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("speeds up every game delay", async () => {
    vi.resetModules()
    vi.stubEnv("GAME_SPEED", "10")

    const { SECOND_MS } = await import("@razzia/socket/utils/sleep")

    expect(SECOND_MS).toBe(100)
  })

  it("keeps real seconds by default", async () => {
    vi.resetModules()

    const { SECOND_MS } = await import("@razzia/socket/utils/sleep")

    expect(SECOND_MS).toBe(1000)
  })

  it("refuses an invalid speed", async () => {
    vi.resetModules()
    vi.stubEnv("GAME_SPEED", "0")

    await expect(import("@razzia/socket/env")).rejects.toThrow(
      "GAME_SPEED must be a positive number",
    )
  })
})
