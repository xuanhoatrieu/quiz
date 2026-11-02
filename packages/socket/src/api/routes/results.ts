import { apiFactory } from "@razzia/socket/api/factory"
import { requireManager } from "@razzia/socket/api/middleware"
import {
  deleteResultForOwner,
  getResultByIdForOwner,
  listResultsMetaForOwner,
} from "@razzia/socket/services/store"
import { StatusCodes } from "http-status-codes"

const routes = apiFactory
  .createApp()
  .use(requireManager)
  .get("/", async (c) =>
    c.json({ results: await listResultsMetaForOwner(c.get("claims").sub) }),
  )
  .get("/:id", async (c) =>
    c.json(await getResultByIdForOwner(c.req.param("id"), c.get("claims").sub)),
  )
  .delete("/:id", async (c) => {
    await deleteResultForOwner(c.req.param("id"), c.get("claims").sub)

    return c.body(null, StatusCodes.NO_CONTENT)
  })

export const results = routes
