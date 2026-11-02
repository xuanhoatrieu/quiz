import { zValidator } from "@hono/zod-validator"
import {
  adminFetchAiModelsValidator,
  adminUpdateAiSettingsValidator,
} from "@razzia/common/validators/ai"
import {
  adminCreateUserValidator,
  adminInviteSettingsValidator,
  adminUpdateUserValidator,
} from "@razzia/common/validators/auth"
import { apiFactory } from "@razzia/socket/api/factory"
import { requireAdmin } from "@razzia/socket/api/middleware"
import { i18nHook } from "@razzia/socket/api/validation"
import { fetchAvailableAiModels } from "@razzia/socket/services/ai"
import {
  adminCreateUser,
  adminDeleteUser,
  adminUpdateUser,
  getAdminAiSettings,
  getInviteSettings,
  listUsers,
  updateAdminAiSettings,
  updateInviteSettings,
} from "@razzia/socket/services/store"
import { StatusCodes } from "http-status-codes"

const routes = apiFactory
  .createApp()
  .use(requireAdmin)
  .get("/users", async (c) => c.json({ users: await listUsers() }))
  .post(
    "/users",
    zValidator("json", adminCreateUserValidator, i18nHook),
    async (c) => {
      const user = await adminCreateUser(c.req.valid("json"))

      return c.json({ user }, StatusCodes.CREATED)
    },
  )
  .patch(
    "/users/:id",
    zValidator("json", adminUpdateUserValidator, i18nHook),
    async (c) => {
      const actor = c.get("claims")
      const user = await adminUpdateUser(
        actor.sub,
        c.req.param("id"),
        c.req.valid("json"),
      )

      return c.json({ user })
    },
  )
  .delete("/users/:id", async (c) => {
    const actor = c.get("claims")
    await adminDeleteUser(actor.sub, c.req.param("id"))

    return c.body(null, StatusCodes.NO_CONTENT)
  })
  .get("/invite", async (c) => c.json(await getInviteSettings()))
  .patch(
    "/invite",
    zValidator("json", adminInviteSettingsValidator, i18nHook),
    async (c) => c.json(await updateInviteSettings(c.req.valid("json"))),
  )
  .get("/ai", async (c) => c.json(await getAdminAiSettings()))
  .patch(
    "/ai",
    zValidator("json", adminUpdateAiSettingsValidator, i18nHook),
    async (c) => c.json(await updateAdminAiSettings(c.req.valid("json"))),
  )
  .post(
    "/ai/models",
    zValidator("json", adminFetchAiModelsValidator, i18nHook),
    async (c) =>
      c.json({
        models: await fetchAvailableAiModels(c.req.valid("json")),
      }),
  )

export const admin = routes
