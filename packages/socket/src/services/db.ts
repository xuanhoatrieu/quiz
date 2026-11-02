import { databaseUrl } from "@razzia/socket/env"
import postgres, { type Sql } from "postgres"

let sqlInstance: Sql | null = null

export const isPostgresEnabled = (): boolean => Boolean(databaseUrl)

export const getSql = (): Sql => {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured")
  }

  sqlInstance ??= postgres(databaseUrl, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {
      /* Suppress IF NOT EXISTS notices */
    },
  })

  return sqlInstance
}

const ensureDatabaseExists = async (): Promise<void> => {
  if (!databaseUrl) {
    return
  }

  const sql = getSql()

  try {
    await sql`SELECT 1`
  } catch (error) {
    const pgCode =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : ""

    if (pgCode !== "3D000") {
      throw error
    }

    const parsedUrl = new URL(databaseUrl)
    const dbName = parsedUrl.pathname.replace(/^\//, "")

    if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
      throw error
    }

    parsedUrl.pathname = "/postgres"
    const maintenanceSql = postgres(parsedUrl.toString(), {
      max: 1,
      connect_timeout: 10,
    })

    try {
      await maintenanceSql.unsafe(`CREATE DATABASE "${dbName}"`)
    } finally {
      await maintenanceSql.end({ timeout: 5 })
    }

    await sql.end({ timeout: 5 })
    sqlInstance = null
  }
}

export const initPostgresSchema = async (): Promise<void> => {
  await ensureDatabaseExists()
  const sql = getSql()

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('manager', 'admin')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      session_version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      game_mode TEXT NOT NULL DEFAULT 'quiz',
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_quizzes_owner_id ON quizzes (owner_id)
  `

  await sql`
    CREATE TABLE IF NOT EXISTS results (
      id TEXT PRIMARY KEY,
      owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      game_mode TEXT NOT NULL DEFAULT 'quiz',
      player_count INTEGER NOT NULL DEFAULT 0,
      played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      data JSONB NOT NULL
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_results_owner_id_played_at
    ON results (owner_id, played_at DESC)
  `

  await sql`
    CREATE TABLE IF NOT EXISTS media_files (
      name TEXT PRIMARY KEY,
      owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_media_files_owner_id_created_at
    ON media_files (owner_id, created_at DESC)
  `
}

export const pingDatabase = async (): Promise<boolean> => {
  if (!isPostgresEnabled()) {
    return true
  }

  try {
    const sql = getSql()
    await sql`SELECT 1`

    return true
  } catch {
    return false
  }
}

export const closeDatabase = async (): Promise<void> => {
  if (sqlInstance) {
    await sqlInstance.end({ timeout: 5 })
    sqlInstance = null
  }
}
