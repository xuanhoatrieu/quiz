import { zValidator } from "@hono/zod-validator"
import { quizzValidator } from "@razzia/common/validators/quizz"
import { apiFactory } from "@razzia/socket/api/factory"
import { requireManager } from "@razzia/socket/api/middleware"
import { i18nHook } from "@razzia/socket/api/validation"
import {
  createQuizzForOwner,
  deleteQuizzForOwner,
  getQuizzByIdForOwner,
  listQuizzMetaForOwner,
  updateQuizzForOwner,
} from "@razzia/socket/services/store"
import { StatusCodes } from "http-status-codes"

const routes = apiFactory
  .createApp()
  .use(requireManager)
  .get("/", async (c) =>
    c.json({ quizz: await listQuizzMetaForOwner(c.get("claims").sub) }),
  )
  .get("/:id", async (c) =>
    c.json(await getQuizzByIdForOwner(c.req.param("id"), c.get("claims").sub)),
  )
  .post("/", zValidator("json", quizzValidator, i18nHook), async (c) =>
    c.json(
      await createQuizzForOwner(c.req.valid("json"), c.get("claims").sub),
      StatusCodes.CREATED,
    ),
  )
  .patch("/:id", zValidator("json", quizzValidator, i18nHook), async (c) =>
    c.json(
      await updateQuizzForOwner(
        c.req.param("id"),
        c.req.valid("json"),
        c.get("claims").sub,
      ),
    ),
  )
  .delete("/:id", async (c) => {
    await deleteQuizzForOwner(c.req.param("id"), c.get("claims").sub)

    return c.body(null, StatusCodes.NO_CONTENT)
  })

export const quizz = routes
