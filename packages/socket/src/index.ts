import { createAdaptorServer } from "@hono/node-server"
import { app, createSocketServer } from "@razzia/socket/app"
import { closeDatabase } from "@razzia/socket/services/db"
import Registry from "@razzia/socket/services/registry"
import { initStore } from "@razzia/socket/services/store"

const WS_PORT = Number(process.env.SOCKET_PORT) || 3001

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error)
})

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason)
})

const start = async () => {
  await initStore()

  const server = createAdaptorServer({ fetch: app.fetch })

  createSocketServer(server)

  server.listen(WS_PORT, () => {
    console.log(`Server running on port ${WS_PORT}`)
  })

  const shutdown = async () => {
    Registry.getInstance().cleanup()
    await closeDatabase()
    process.exit(0)
  }

  process.on("SIGINT", () => {
    void shutdown()
  })

  process.on("SIGTERM", () => {
    void shutdown()
  })
}

void start()
