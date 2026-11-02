import { zValidator } from "@hono/zod-validator"
import { aiGenerateQuizzValidator } from "@razzia/common/validators/ai"
import { apiFactory } from "@razzia/socket/api/factory"
import { requireManager } from "@razzia/socket/api/middleware"
import { i18nHook } from "@razzia/socket/api/validation"
import { generateQuizzWithAi } from "@razzia/socket/services/ai"
import { checkAuthRateLimit } from "@razzia/socket/services/rate-limit"
import { getAiStatus } from "@razzia/socket/services/store"

const routes = apiFactory
  .createApp()
  .use(requireManager)
  .get("/status", async (c) => c.json(await getAiStatus()))
  .post(
    "/generate",
    zValidator("json", aiGenerateQuizzValidator, i18nHook),
    async (c) => {
      const claims = c.get("claims")
      checkAuthRateLimit(c, `ai:${claims.sub}`, 10)

      return c.json(await generateQuizzWithAi(c.req.valid("json")))
    },
  )

export const ai = routes
