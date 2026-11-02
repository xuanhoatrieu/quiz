import { admin } from "@razzia/socket/api/routes/admin"
import { ai } from "@razzia/socket/api/routes/ai"
import { auth } from "@razzia/socket/api/routes/auth"
import { games } from "@razzia/socket/api/routes/games"
import { media } from "@razzia/socket/api/routes/media"
import { quizz } from "@razzia/socket/api/routes/quizz"
import { results } from "@razzia/socket/api/routes/results"
import { Hono } from "hono"

const routes = new Hono()
  .get("/health", (c) => c.json({ status: "ok" }))
  .route("/auth", auth)
  .route("/admin", admin)
  .route("/ai", ai)
  .route("/quizz", quizz)
  .route("/results", results)
  .route("/games", games)
  .route("/media", media)

export const api = routes

export type ApiType = typeof routes
