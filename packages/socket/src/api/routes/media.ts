import { zValidator } from "@hono/zod-validator"
import { mediaUploadValidator } from "@razzia/common/validators/quizz"
import { apiFactory } from "@razzia/socket/api/factory"
import { requireManager } from "@razzia/socket/api/middleware"
import { i18nHook } from "@razzia/socket/api/validation"
import { maxMediaSizeBytes } from "@razzia/socket/env"
import {
  deleteMediaForOwner,
  listMediaForOwner,
  saveMediaForOwner,
} from "@razzia/socket/services/store"
import { bodyLimit } from "hono/body-limit"
import { StatusCodes } from "http-status-codes"

const MULTIPART_OVERHEAD = 64 * 1024

const routes = apiFactory
  .createApp()
  .use(requireManager)
  .get("/", async (c) =>
    c.json({ media: await listMediaForOwner(c.get("claims").sub) }),
  )
  .post(
    "/",
    bodyLimit({
      maxSize: maxMediaSizeBytes + MULTIPART_OVERHEAD,
      onError: (c) =>
        c.json(
          { error: "errors:media.tooLarge" },
          StatusCodes.REQUEST_TOO_LONG,
        ),
    }),
    zValidator("form", mediaUploadValidator, i18nHook),
    async (c) =>
      c.json(
        await saveMediaForOwner(c.req.valid("form").file, c.get("claims").sub),
        StatusCodes.CREATED,
      ),
  )
  .delete("/:name", async (c) => {
    await deleteMediaForOwner(c.req.param("name"), c.get("claims").sub)

    return c.body(null, StatusCodes.NO_CONTENT)
  })

export const media = routes
