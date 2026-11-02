import {
  MEDIA_URL_PREFIX,
  QUIZZ_MODES,
  SESSION_ROLES,
} from "@razzia/common/constants"
import type {
  AdminAiSettingsResponse,
  AiStatusResponse,
} from "@razzia/common/types/ai"
import type {
  AccountRole,
  InviteSettings,
  UserSummary,
} from "@razzia/common/types/auth"
import type {
  GameResult,
  GameResultMeta,
  Quizz,
  QuizzMode,
  QuizzWithId,
  UploadedMedia,
  UploadedMediaType,
} from "@razzia/common/types/game"
import {
  normalizeLegacyQuizz,
  quizzValidator,
} from "@razzia/common/validators/quizz"
import {
  adminDisplayName,
  adminUsername,
  aiApiKeyEnv,
  aiBaseUrlEnv,
  aiModelEnv,
  managerPassword,
  maxMediaSizeBytes,
  teacherInviteCodeEnv,
} from "@razzia/socket/env"
import {
  deleteQuizz as deleteFileQuizz,
  deleteResult as deleteFileResult,
  getQuizz as getFileQuizzes,
  getQuizzById as getFileQuizzById,
  getResultById as getFileResultById,
  getResultsMeta as getFileResultsMeta,
  initConfig,
  registerConfigResetHook,
  saveQuizz as saveFileQuizz,
  saveResult as saveFileResult,
  updateQuizz as updateFileQuizz,
} from "@razzia/socket/services/config"
import {
  getSql,
  initPostgresSchema,
  isPostgresEnabled,
} from "@razzia/socket/services/db"
import {
  conflict,
  DomainError,
  forbidden,
  invalidInput,
  notFound,
} from "@razzia/socket/services/errors"
import {
  assertValidMediaName,
  deleteMedia as deletePhysicalMedia,
  listMedia as listPhysicalMedia,
  saveMedia as savePhysicalMedia,
} from "@razzia/socket/services/media"
import {
  constantTimeStringEquals,
  hashPassword,
  verifyPassword,
} from "@razzia/socket/services/password"
import { randomBytes } from "crypto"
import { nanoid } from "nanoid"
import type { JSONValue } from "postgres"
import { v7 as uuid } from "uuid"

export interface UserRecord extends UserSummary {
  passwordHash: string
  sessionVersion: number
}

const STARTER_VI_QUIZZ: Quizz = {
  gameMode: QUIZZ_MODES.QUIZ,
  subject: "Đề mẫu Trắc nghiệm Khởi động",
  questions: [
    {
      type: "single",
      question:
        "Hình thức kiểm tra trực tuyến theo thời gian thực giúp tăng yếu tố nào trong lớp học?",
      answers: [
        "Sự tương tác và hứng thú học tập",
        "Thời gian chấm bài thủ công",
        "Chi phí in ấn giấy tờ",
        "Độ trễ phản hồi điểm số",
      ],
      solutions: [0],
      cooldown: 5,
      time: 20,
      maxPoints: 1000,
    },
    {
      type: "multi",
      question: "Hệ thống Quiz hỗ trợ những chế độ tổ chức nào dưới đây?",
      answers: [
        "Thi trắc nghiệm tính điểm (Quiz)",
        "Khảo sát lấy ý kiến (Survey)",
        "Câu hỏi ước lượng con số (Estimation)",
        "Tự động khóa máy tính sinh viên",
      ],
      solutions: [0, 1, 2],
      cooldown: 5,
      time: 25,
      maxPoints: 1000,
    },
  ],
}

const generateDefaultInviteCode = (): string =>
  randomBytes(4).toString("hex").toUpperCase()

const subjectCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

const toUserSummary = (record: UserRecord): UserSummary => ({
  id: record.id,
  username: record.username,
  displayName: record.displayName,
  role: record.role,
  active: record.active,
  createdAt: record.createdAt,
})

// ── In-memory fallback state (used when DATABASE_URL is absent in unit tests) ─

export interface AiProviderRecord {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
}

const buildInitialAiSettings = (): AiProviderRecord => {
  const baseUrl = (aiBaseUrlEnv ?? "").trim().replace(/\/+$/u, "")
  const apiKey = (aiApiKeyEnv ?? "").trim()
  const model = (aiModelEnv || "gemini-3-flash-preview").trim()

  return {
    enabled: Boolean(baseUrl && apiKey),
    baseUrl,
    apiKey,
    model,
  }
}

const memUsers = new Map<string, UserRecord>()
const memQuizOwners = new Map<string, string>()
const memResultOwners = new Map<string, string>()
const memMediaOwners = new Map<string, string>()
let memInviteSettings: InviteSettings = {
  enabled: Boolean(teacherInviteCodeEnv),
  code: teacherInviteCodeEnv ?? generateDefaultInviteCode(),
}
let memAiSettings: AiProviderRecord = buildInitialAiSettings()

const resetInMemoryState = () => {
  memUsers.clear()
  memQuizOwners.clear()
  memResultOwners.clear()
  memMediaOwners.clear()
  memInviteSettings = {
    enabled: Boolean(teacherInviteCodeEnv),
    code: teacherInviteCodeEnv ?? generateDefaultInviteCode(),
  }
  memAiSettings = buildInitialAiSettings()
}

registerConfigResetHook(resetInMemoryState)

const ensureMemoryBootstrapAdmin = async (): Promise<void> => {
  if (memUsers.size > 0 || !managerPassword) {
    return
  }

  const id = uuid()
  const passwordHash = await hashPassword(managerPassword)

  memUsers.set(id, {
    id,
    username: adminUsername,
    displayName: adminDisplayName,
    passwordHash,
    role: SESSION_ROLES.ADMIN,
    active: true,
    sessionVersion: 1,
    createdAt: new Date().toISOString(),
  })
}

// ── PostgreSQL row mappers ───────────────────────────────────────────────────

interface PgUserRow {
  id: string
  username: string
  display_name: string
  password_hash: string
  role: AccountRole
  active: boolean
  session_version: number
  created_at: Date | string
}

interface PgSettingRow {
  value: unknown
}

interface PgCountRow {
  count: string
}

interface PgIdRow {
  id: string
}

interface PgNameRow {
  name: string
}

interface PgQuizMetaRow {
  id: string
  subject: string
}

interface PgQuizRow {
  id: string
  data: unknown
}

interface PgResultMetaRow {
  id: string
  game_mode: QuizzMode
  subject: string
  played_at: Date | string
  player_count: number
}

interface PgResultDataRow {
  data: unknown
}

interface PgMediaRow {
  name: string
  type: UploadedMediaType
}

const mapPgUser = (row: PgUserRow): UserRecord => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  passwordHash: row.password_hash,
  role: row.role,
  active: row.active,
  sessionVersion: row.session_version,
  createdAt:
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : row.created_at,
})

const parseJsonColumn = (raw: unknown): unknown =>
  typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw

const toJsonParam = (value: unknown): JSONValue => value as JSONValue

// ── Store initialization ─────────────────────────────────────────────────────

export const initStore = async (): Promise<void> => {
  initConfig()

  if (!isPostgresEnabled()) {
    await ensureMemoryBootstrapAdmin()

    return
  }

  await initPostgresSchema()
  const sql = getSql()

  const existingInvite = await sql<PgSettingRow[]>`
    SELECT value FROM app_settings WHERE key = 'teacher_invite' LIMIT 1
  `

  if (existingInvite.length === 0) {
    const initialInvite: InviteSettings = {
      enabled: Boolean(teacherInviteCodeEnv),
      code: teacherInviteCodeEnv ?? generateDefaultInviteCode(),
    }

    await sql`
      INSERT INTO app_settings (key, value)
      VALUES ('teacher_invite', ${sql.json(toJsonParam(initialInvite))})
      ON CONFLICT (key) DO NOTHING
    `
  }

  const existingAi = await sql<PgSettingRow[]>`
    SELECT value FROM app_settings WHERE key = 'ai_provider' LIMIT 1
  `

  if (existingAi.length === 0) {
    const initialAi = buildInitialAiSettings()

    await sql`
      INSERT INTO app_settings (key, value)
      VALUES ('ai_provider', ${sql.json(toJsonParam(initialAi))})
      ON CONFLICT (key) DO NOTHING
    `
  }

  if (managerPassword) {
    const admins = await sql<PgUserRow[]>`
      SELECT * FROM users WHERE role = 'admin' LIMIT 1
    `

    if (admins.length === 0) {
      const id = uuid()
      const passwordHash = await hashPassword(managerPassword)

      await sql`
        INSERT INTO users (id, username, display_name, password_hash, role, active, session_version)
        VALUES (${id}, ${adminUsername}, ${adminDisplayName}, ${passwordHash}, 'admin', TRUE, 1)
        ON CONFLICT (username) DO NOTHING
      `

      const inserted = await sql<PgUserRow[]>`
        SELECT * FROM users WHERE username = ${adminUsername} LIMIT 1
      `

      if (inserted.length > 0) {
        await seedStarterQuizzForOwner(inserted[0].id)
      }
    }
  }
}

const seedStarterQuizzForOwner = async (ownerId: string): Promise<void> => {
  if (!isPostgresEnabled()) {
    return
  }

  const sql = getSql()
  const countRows = await sql<PgCountRow[]>`
    SELECT COUNT(*)::text AS count FROM quizzes WHERE owner_id = ${ownerId}
  `

  if (countRows.length > 0 && Number(countRows[0].count) > 0) {
    return
  }

  const id = nanoid()

  await sql`
    INSERT INTO quizzes (id, owner_id, subject, game_mode, data)
    VALUES (
      ${id},
      ${ownerId},
      ${STARTER_VI_QUIZZ.subject},
      ${STARTER_VI_QUIZZ.gameMode},
      ${sql.json(toJsonParam(STARTER_VI_QUIZZ))}
    )
  `
}

// ── Authentication & Account Management ──────────────────────────────────────

export const findUserById = async (id: string): Promise<UserRecord | null> => {
  if (!isPostgresEnabled()) {
    await ensureMemoryBootstrapAdmin()

    return memUsers.get(id) ?? null
  }

  const sql = getSql()
  const rows = await sql<PgUserRow[]>`
    SELECT * FROM users WHERE id = ${id} LIMIT 1
  `

  return rows.length > 0 ? mapPgUser(rows[0]) : null
}

export const findUserByUsername = async (
  username: string,
): Promise<UserRecord | null> => {
  const normalized = username.trim().toLowerCase()

  if (!isPostgresEnabled()) {
    await ensureMemoryBootstrapAdmin()

    for (const user of memUsers.values()) {
      if (user.username === normalized) {
        return user
      }
    }

    return null
  }

  const sql = getSql()
  const rows = await sql<PgUserRow[]>`
    SELECT * FROM users WHERE username = ${normalized} LIMIT 1
  `

  return rows.length > 0 ? mapPgUser(rows[0]) : null
}

export const authenticateAccount = async (
  username: string,
  password: string,
): Promise<UserRecord> => {
  const user = await findUserByUsername(username)

  if (!user) {
    throw forbidden("errors:auth.invalidCredentials")
  }

  const valid = await verifyPassword(password, user.passwordHash)

  if (!valid) {
    throw forbidden("errors:auth.invalidCredentials")
  }

  if (!user.active) {
    throw forbidden("errors:auth.accountDisabled")
  }

  return user
}

export const validateSessionUser = async (
  userId: string,
  ver?: number,
): Promise<UserRecord | null> => {
  if (ver === undefined) {
    return null
  }

  const user = await findUserById(userId)

  if (!user || !user.active || user.sessionVersion !== ver) {
    return null
  }

  return user
}

export const revokeUserSessions = async (userId: string): Promise<void> => {
  if (!isPostgresEnabled()) {
    const existing = memUsers.get(userId)

    if (existing) {
      existing.sessionVersion += 1
    }

    return
  }

  const sql = getSql()

  await sql`
    UPDATE users
    SET session_version = session_version + 1
    WHERE id = ${userId}
  `
}

export const getInviteSettings = async (): Promise<InviteSettings> => {
  if (!isPostgresEnabled()) {
    return { ...memInviteSettings }
  }

  const sql = getSql()
  const rows = await sql<PgSettingRow[]>`
    SELECT value FROM app_settings WHERE key = 'teacher_invite' LIMIT 1
  `

  if (rows.length === 0) {
    const fallback: InviteSettings = {
      enabled: Boolean(teacherInviteCodeEnv),
      code: teacherInviteCodeEnv ?? generateDefaultInviteCode(),
    }

    await sql`
      INSERT INTO app_settings (key, value)
      VALUES ('teacher_invite', ${sql.json(toJsonParam(fallback))})
      ON CONFLICT (key) DO NOTHING
    `

    return fallback
  }

  const parsed = parseJsonColumn(rows[0].value) as Partial<InviteSettings>

  return {
    enabled: Boolean(parsed.enabled),
    code:
      typeof parsed.code === "string" && parsed.code.length >= 4
        ? parsed.code
        : generateDefaultInviteCode(),
  }
}

export const updateInviteSettings = async (input: {
  enabled: boolean
  code?: string
}): Promise<InviteSettings> => {
  const current = await getInviteSettings()
  const trimmedCode = input.code?.trim()
  let nextCode = generateDefaultInviteCode()

  if (trimmedCode && trimmedCode.length > 0) {
    nextCode = trimmedCode
  } else if (current.code.length > 0) {
    nextCode = current.code
  }

  const next: InviteSettings = {
    enabled: input.enabled,
    code: nextCode,
  }

  if (!isPostgresEnabled()) {
    memInviteSettings = next

    return { ...next }
  }

  const sql = getSql()

  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('teacher_invite', ${sql.json(toJsonParam(next))}, NOW())
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `

  return next
}

export const registerTeacherWithInvite = async (input: {
  username: string
  displayName: string
  password: string
  inviteCode: string
}): Promise<UserRecord> => {
  const settings = await getInviteSettings()

  if (!settings.enabled) {
    throw forbidden("errors:auth.inviteDisabled")
  }

  if (!constantTimeStringEquals(input.inviteCode.trim(), settings.code)) {
    throw forbidden("errors:auth.teacherInviteInvalid")
  }

  const existing = await findUserByUsername(input.username)

  if (existing) {
    throw conflict("errors:auth.usernameTaken")
  }

  const id = uuid()
  const normalizedUsername = input.username.trim().toLowerCase()
  const cleanDisplayName = input.displayName.trim()
  const passwordHash = await hashPassword(input.password)

  if (!isPostgresEnabled()) {
    const record: UserRecord = {
      id,
      username: normalizedUsername,
      displayName: cleanDisplayName,
      passwordHash,
      role: SESSION_ROLES.MANAGER,
      active: true,
      sessionVersion: 1,
      createdAt: new Date().toISOString(),
    }

    memUsers.set(id, record)

    return record
  }

  const sql = getSql()
  const rows = await sql<PgUserRow[]>`
    INSERT INTO users (id, username, display_name, password_hash, role, active, session_version)
    VALUES (${id}, ${normalizedUsername}, ${cleanDisplayName}, ${passwordHash}, 'manager', TRUE, 1)
    RETURNING *
  `

  await seedStarterQuizzForOwner(id)

  return mapPgUser(rows[0])
}

export const changeAccountPassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<UserRecord> => {
  const user = await findUserById(userId)

  if (!user || !user.active) {
    throw forbidden("errors:auth.unauthorized")
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash)

  if (!valid) {
    throw forbidden("errors:auth.invalidCredentials")
  }

  const nextHash = await hashPassword(newPassword)

  if (!isPostgresEnabled()) {
    user.passwordHash = nextHash
    user.sessionVersion += 1

    return user
  }

  const sql = getSql()
  const rows = await sql<PgUserRow[]>`
    UPDATE users
    SET password_hash = ${nextHash},
        session_version = session_version + 1
    WHERE id = ${userId}
    RETURNING *
  `

  return mapPgUser(rows[0])
}

export const listUsers = async (): Promise<UserSummary[]> => {
  if (!isPostgresEnabled()) {
    await ensureMemoryBootstrapAdmin()

    return [...memUsers.values()]
      .sort((a, b) => {
        if (a.role !== b.role) {
          return a.role === SESSION_ROLES.ADMIN ? -1 : 1
        }

        return a.createdAt.localeCompare(b.createdAt)
      })
      .map(toUserSummary)
  }

  const sql = getSql()
  const rows = await sql<PgUserRow[]>`
    SELECT * FROM users
    ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, created_at ASC
  `

  return rows.map((row) => toUserSummary(mapPgUser(row)))
}

export const adminCreateUser = async (input: {
  username: string
  displayName: string
  password: string
  role: AccountRole
}): Promise<UserSummary> => {
  const normalizedUsername = input.username.trim().toLowerCase()
  const existing = await findUserByUsername(normalizedUsername)

  if (existing) {
    throw conflict("errors:auth.usernameTaken")
  }

  const id = uuid()
  const cleanDisplayName = input.displayName.trim()
  const passwordHash = await hashPassword(input.password)

  if (!isPostgresEnabled()) {
    const record: UserRecord = {
      id,
      username: normalizedUsername,
      displayName: cleanDisplayName,
      passwordHash,
      role: input.role,
      active: true,
      sessionVersion: 1,
      createdAt: new Date().toISOString(),
    }

    memUsers.set(id, record)

    return toUserSummary(record)
  }

  const sql = getSql()
  const rows = await sql<PgUserRow[]>`
    INSERT INTO users (id, username, display_name, password_hash, role, active, session_version)
    VALUES (${id}, ${normalizedUsername}, ${cleanDisplayName}, ${passwordHash}, ${input.role}, TRUE, 1)
    RETURNING *
  `

  await seedStarterQuizzForOwner(id)

  return toUserSummary(mapPgUser(rows[0]))
}

export const adminUpdateUser = async (
  actorId: string,
  targetId: string,
  input: {
    displayName?: string
    role?: AccountRole
    active?: boolean
    password?: string
  },
): Promise<UserSummary> => {
  if (
    actorId === targetId &&
    (input.active === false ||
      (input.role !== undefined && input.role !== SESSION_ROLES.ADMIN))
  ) {
    throw invalidInput("errors:admin.cannotModifySelf")
  }

  const target = await findUserById(targetId)

  if (!target) {
    throw notFound("errors:admin.userNotFound")
  }

  const nextDisplayName = input.displayName?.trim() ?? target.displayName
  const nextRole = input.role ?? target.role
  const nextActive = input.active ?? target.active
  const nextHash = input.password
    ? await hashPassword(input.password)
    : target.passwordHash
  const shouldBumpSession =
    Boolean(input.password) ||
    nextActive !== target.active ||
    nextRole !== target.role
  const nextVersion = target.sessionVersion + (shouldBumpSession ? 1 : 0)

  if (!isPostgresEnabled()) {
    target.displayName = nextDisplayName
    target.role = nextRole
    target.active = nextActive
    target.passwordHash = nextHash
    target.sessionVersion = nextVersion

    return toUserSummary(target)
  }

  const sql = getSql()
  const rows = await sql<PgUserRow[]>`
    UPDATE users
    SET display_name = ${nextDisplayName},
        role = ${nextRole},
        active = ${nextActive},
        password_hash = ${nextHash},
        session_version = ${nextVersion}
    WHERE id = ${targetId}
    RETURNING *
  `

  return toUserSummary(mapPgUser(rows[0]))
}

export const adminDeleteUser = async (
  actorId: string,
  targetId: string,
): Promise<void> => {
  if (actorId === targetId) {
    throw invalidInput("errors:admin.cannotModifySelf")
  }

  const target = await findUserById(targetId)

  if (!target) {
    throw notFound("errors:admin.userNotFound")
  }

  if (!isPostgresEnabled()) {
    for (const [mediaName, owner] of memMediaOwners.entries()) {
      if (owner === targetId) {
        try {
          deletePhysicalMedia(mediaName)
        } catch {
          /* Ignore missing physical file */
        }

        memMediaOwners.delete(mediaName)
      }
    }

    for (const [quizId, owner] of memQuizOwners.entries()) {
      if (owner === targetId) {
        try {
          deleteFileQuizz(quizId)
        } catch {
          /* Ignore */
        }

        memQuizOwners.delete(quizId)
      }
    }

    for (const [resultId, owner] of memResultOwners.entries()) {
      if (owner === targetId) {
        try {
          deleteFileResult(resultId)
        } catch {
          /* Ignore */
        }

        memResultOwners.delete(resultId)
      }
    }

    memUsers.delete(targetId)

    return
  }

  const sql = getSql()
  const mediaRows = await sql<PgNameRow[]>`
    SELECT name FROM media_files WHERE owner_id = ${targetId}
  `

  for (const row of mediaRows) {
    try {
      deletePhysicalMedia(row.name)
    } catch {
      /* Ignore missing physical file */
    }
  }

  await sql`DELETE FROM users WHERE id = ${targetId}`
}

// ── Tenant-Isolated Quizzes ──────────────────────────────────────────────────

const canAccessMemoryResource = (
  ownerMap: Map<string, string>,
  id: string,
  ownerId: string,
): boolean => {
  const recordedOwner = ownerMap.get(id)

  if (recordedOwner !== undefined) {
    return recordedOwner === ownerId
  }

  const account = memUsers.get(ownerId)

  return !account || account.role === SESSION_ROLES.ADMIN
}

export const listQuizzMetaForOwner = async (
  ownerId: string,
): Promise<PgQuizMetaRow[]> => {
  if (!isPostgresEnabled()) {
    return getFileQuizzes()
      .filter((q) => canAccessMemoryResource(memQuizOwners, q.id, ownerId))
      .map(({ id, subject }) => ({ id, subject }))
      .sort((a, b) => subjectCollator.compare(a.subject, b.subject))
  }

  const sql = getSql()
  const rows = await sql<PgQuizMetaRow[]>`
    SELECT id, subject
    FROM quizzes
    WHERE owner_id = ${ownerId}
    ORDER BY subject ASC
  `

  return rows.sort((a, b) => subjectCollator.compare(a.subject, b.subject))
}

export const getQuizzByIdForOwner = async (
  id: string,
  ownerId: string,
): Promise<QuizzWithId> => {
  if (!isPostgresEnabled()) {
    if (!canAccessMemoryResource(memQuizOwners, id, ownerId)) {
      throw notFound("errors:quizz.notFound")
    }

    return getFileQuizzById(id)
  }

  const sql = getSql()
  const rows = await sql<PgQuizRow[]>`
    SELECT id, data
    FROM quizzes
    WHERE id = ${id} AND owner_id = ${ownerId}
    LIMIT 1
  `

  if (rows.length === 0) {
    throw notFound("errors:quizz.notFound")
  }

  const parsed = quizzValidator.safeParse(
    normalizeLegacyQuizz(parseJsonColumn(rows[0].data)),
  )

  if (!parsed.success) {
    throw notFound("errors:quizz.notFound")
  }

  return { id: rows[0].id, ...parsed.data }
}

export const createQuizzForOwner = async (
  data: unknown,
  ownerId: string,
): Promise<{ id: string }> => {
  const result = quizzValidator.safeParse(data)

  if (!result.success) {
    throw invalidInput(result.error.issues[0].message)
  }

  if (!isPostgresEnabled()) {
    const created = saveFileQuizz(result.data)
    memQuizOwners.set(created.id, ownerId)

    return created
  }

  const id = nanoid()
  const sql = getSql()

  await sql`
    INSERT INTO quizzes (id, owner_id, subject, game_mode, data)
    VALUES (
      ${id},
      ${ownerId},
      ${result.data.subject},
      ${result.data.gameMode},
      ${sql.json(result.data)}
    )
  `

  return { id }
}

export const updateQuizzForOwner = async (
  id: string,
  data: unknown,
  ownerId: string,
): Promise<{ id: string }> => {
  const result = quizzValidator.safeParse(data)

  if (!result.success) {
    throw invalidInput(result.error.issues[0].message)
  }

  if (!isPostgresEnabled()) {
    if (!canAccessMemoryResource(memQuizOwners, id, ownerId)) {
      throw notFound("errors:quizz.notFound")
    }

    const updated = updateFileQuizz(id, result.data)
    memQuizOwners.set(id, ownerId)

    return updated
  }

  const sql = getSql()
  const rows = await sql<PgIdRow[]>`
    UPDATE quizzes
    SET subject = ${result.data.subject},
        game_mode = ${result.data.gameMode},
        data = ${sql.json(result.data)},
        updated_at = NOW()
    WHERE id = ${id} AND owner_id = ${ownerId}
    RETURNING id
  `

  if (rows.length === 0) {
    throw notFound("errors:quizz.notFound")
  }

  return { id }
}

export const deleteQuizzForOwner = async (
  id: string,
  ownerId: string,
): Promise<void> => {
  if (!isPostgresEnabled()) {
    if (!canAccessMemoryResource(memQuizOwners, id, ownerId)) {
      throw notFound("errors:quizz.notFound")
    }

    deleteFileQuizz(id)
    memQuizOwners.delete(id)

    return
  }

  const sql = getSql()
  const rows = await sql<PgIdRow[]>`
    DELETE FROM quizzes
    WHERE id = ${id} AND owner_id = ${ownerId}
    RETURNING id
  `

  if (rows.length === 0) {
    throw notFound("errors:quizz.notFound")
  }
}

// ── Tenant-Isolated Results ──────────────────────────────────────────────────

export const recordResultForOwner = async (
  data: GameResult,
  ownerId?: string,
): Promise<void> => {
  if (!isPostgresEnabled()) {
    saveFileResult(data)

    if (ownerId) {
      memResultOwners.set(data.id, ownerId)
    }

    return
  }

  try {
    const sql = getSql()
    const validOwner = ownerId ? await findUserById(ownerId) : null

    await sql`
      INSERT INTO results (id, owner_id, subject, game_mode, player_count, played_at, data)
      VALUES (
        ${data.id},
        ${validOwner ? validOwner.id : null},
        ${data.subject},
        ${data.gameMode},
        ${data.players.length},
        ${new Date(data.date)},
        ${sql.json(toJsonParam(data))}
      )
      ON CONFLICT (id) DO NOTHING
    `
  } catch (error) {
    console.error("Failed to save game result to PostgreSQL:", error)
  }
}

export const listResultsMetaForOwner = async (
  ownerId: string,
): Promise<GameResultMeta[]> => {
  if (!isPostgresEnabled()) {
    return getFileResultsMeta().filter((r) =>
      canAccessMemoryResource(memResultOwners, r.id, ownerId),
    )
  }

  const sql = getSql()
  const rows = await sql<PgResultMetaRow[]>`
    SELECT id, game_mode, subject, played_at, player_count
    FROM results
    WHERE owner_id = ${ownerId}
    ORDER BY played_at DESC
  `

  return rows.map((row) => ({
    id: row.id,
    gameMode: row.game_mode,
    subject: row.subject,
    date:
      row.played_at instanceof Date
        ? row.played_at.toISOString()
        : row.played_at,
    playerCount: row.player_count,
  }))
}

export const getResultByIdForOwner = async (
  id: string,
  ownerId: string,
): Promise<GameResult> => {
  if (!isPostgresEnabled()) {
    if (!canAccessMemoryResource(memResultOwners, id, ownerId)) {
      throw notFound("errors:result.notFound")
    }

    return getFileResultById(id)
  }

  const sql = getSql()
  const rows = await sql<PgResultDataRow[]>`
    SELECT data
    FROM results
    WHERE id = ${id} AND owner_id = ${ownerId}
    LIMIT 1
  `

  if (rows.length === 0) {
    throw notFound("errors:result.notFound")
  }

  const parsed = parseJsonColumn(rows[0].data) as Omit<
    GameResult,
    "gameMode"
  > & {
    gameMode?: QuizzMode
  }

  return {
    ...parsed,
    gameMode: parsed.gameMode ?? QUIZZ_MODES.QUIZ,
  }
}

export const deleteResultForOwner = async (
  id: string,
  ownerId: string,
): Promise<void> => {
  if (!isPostgresEnabled()) {
    if (!canAccessMemoryResource(memResultOwners, id, ownerId)) {
      throw notFound("errors:result.notFound")
    }

    deleteFileResult(id)
    memResultOwners.delete(id)

    return
  }

  const sql = getSql()
  const rows = await sql<PgIdRow[]>`
    DELETE FROM results
    WHERE id = ${id} AND owner_id = ${ownerId}
    RETURNING id
  `

  if (rows.length === 0) {
    throw notFound("errors:result.notFound")
  }
}

// ── Tenant-Isolated Media ────────────────────────────────────────────────────

export const listMediaForOwner = async (
  ownerId: string,
): Promise<UploadedMedia[]> => {
  if (!isPostgresEnabled()) {
    return listPhysicalMedia().filter((m) =>
      canAccessMemoryResource(memMediaOwners, m.name, ownerId),
    )
  }

  const sql = getSql()
  const rows = await sql<PgMediaRow[]>`
    SELECT name, type
    FROM media_files
    WHERE owner_id = ${ownerId}
    ORDER BY created_at DESC
  `

  return rows.map((row) => ({
    name: row.name,
    url: `${MEDIA_URL_PREFIX}${row.name}`,
    type: row.type,
  }))
}

export const saveMediaForOwner = async (
  file: File,
  ownerId: string,
): Promise<UploadedMedia> => {
  if (file.size > maxMediaSizeBytes) {
    throw new DomainError("errors:media.tooLarge", 413 as never)
  }

  const saved = await savePhysicalMedia(file)

  if (!isPostgresEnabled()) {
    memMediaOwners.set(saved.name, ownerId)

    return saved
  }

  const sql = getSql()
  const validOwner = await findUserById(ownerId)

  await sql`
    INSERT INTO media_files (name, owner_id, type, size_bytes)
    VALUES (
      ${saved.name},
      ${validOwner ? validOwner.id : null},
      ${saved.type},
      ${file.size}
    )
  `

  return saved
}

export const deleteMediaForOwner = async (
  name: string,
  ownerId: string,
): Promise<void> => {
  assertValidMediaName(name)

  if (!isPostgresEnabled()) {
    if (!canAccessMemoryResource(memMediaOwners, name, ownerId)) {
      throw notFound("errors:media.notFound")
    }

    deletePhysicalMedia(name)
    memMediaOwners.delete(name)

    return
  }

  const sql = getSql()
  const rows = await sql<PgNameRow[]>`
    DELETE FROM media_files
    WHERE name = ${name} AND owner_id = ${ownerId}
    RETURNING name
  `

  if (rows.length === 0) {
    throw notFound("errors:media.notFound")
  }

  try {
    deletePhysicalMedia(name)
  } catch (error) {
    if (
      error instanceof DomainError &&
      error.key === "errors:media.invalidName"
    ) {
      throw error
    }
  }
}

// ── AI Provider Settings ─────────────────────────────────────────────────────

export const maskApiKey = (apiKey: string): string => {
  const trimmed = apiKey.trim()

  if (trimmed.length === 0) {
    return ""
  }

  if (trimmed.length <= 8) {
    return "••••••••"
  }

  return `${trimmed.slice(0, 3)}...${trimmed.slice(-4)}`
}

const toAdminAiResponse = (
  record: AiProviderRecord,
): AdminAiSettingsResponse => ({
  enabled: record.enabled,
  baseUrl: record.baseUrl,
  model: record.model,
  hasApiKey: record.apiKey.length > 0,
  apiKeyMasked: maskApiKey(record.apiKey),
})

export const getAiProviderRecord = async (): Promise<AiProviderRecord> => {
  if (!isPostgresEnabled()) {
    return { ...memAiSettings }
  }

  const sql = getSql()
  const rows = await sql<PgSettingRow[]>`
    SELECT value FROM app_settings WHERE key = 'ai_provider' LIMIT 1
  `

  const envFallback = buildInitialAiSettings()

  if (rows.length === 0) {
    await sql`
      INSERT INTO app_settings (key, value)
      VALUES ('ai_provider', ${sql.json(toJsonParam(envFallback))})
      ON CONFLICT (key) DO NOTHING
    `

    return envFallback
  }

  const parsed = parseJsonColumn(rows[0].value) as Partial<AiProviderRecord>
  const storedBaseUrl =
    typeof parsed.baseUrl === "string"
      ? parsed.baseUrl.trim().replace(/\/+$/u, "")
      : ""
  const storedApiKey =
    typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : ""
  const storedModel =
    typeof parsed.model === "string" && parsed.model.trim().length > 0
      ? parsed.model.trim()
      : envFallback.model

  // Hydrate from .env if DB row was previously unconfigured
  if (
    storedBaseUrl.length === 0 &&
    storedApiKey.length === 0 &&
    envFallback.baseUrl.length > 0 &&
    envFallback.apiKey.length > 0
  ) {
    await sql`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('ai_provider', ${sql.json(toJsonParam(envFallback))}, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `

    return envFallback
  }

  return {
    enabled: Boolean(parsed.enabled),
    baseUrl: storedBaseUrl,
    apiKey: storedApiKey,
    model: storedModel,
  }
}

export const getAiStatus = async (): Promise<AiStatusResponse> => {
  const record = await getAiProviderRecord()
  const ready =
    record.enabled && record.baseUrl.length > 0 && record.apiKey.length > 0

  return {
    enabled: ready,
    model: record.model,
  }
}

export const getAdminAiSettings = async (): Promise<AdminAiSettingsResponse> =>
  toAdminAiResponse(await getAiProviderRecord())

export const updateAdminAiSettings = async (input: {
  enabled: boolean
  baseUrl: string
  apiKey?: string
  clearApiKey?: boolean
  model: string
}): Promise<AdminAiSettingsResponse> => {
  const current = await getAiProviderRecord()
  const cleanBaseUrl = input.baseUrl.trim().replace(/\/+$/u, "")
  const cleanModel =
    input.model.trim().length > 0
      ? input.model.trim()
      : current.model || "gemini-3-flash-preview"

  let nextApiKey = current.apiKey

  if (input.clearApiKey) {
    nextApiKey = ""
  } else if (input.apiKey !== undefined && input.apiKey.trim().length > 0) {
    nextApiKey = input.apiKey.trim()
  }

  const next: AiProviderRecord = {
    enabled: input.enabled && cleanBaseUrl.length > 0 && nextApiKey.length > 0,
    baseUrl: cleanBaseUrl,
    apiKey: nextApiKey,
    model: cleanModel,
  }

  if (!isPostgresEnabled()) {
    memAiSettings = next

    return toAdminAiResponse(next)
  }

  const sql = getSql()

  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('ai_provider', ${sql.json(toJsonParam(next))}, NOW())
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `

  return toAdminAiResponse(next)
}
