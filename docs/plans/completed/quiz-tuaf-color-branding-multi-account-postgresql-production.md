# Quiz TUAF Color Branding & Multi-Account PostgreSQL Production

## Outcome

- [ ] **Multi-Account Authentication & RBAC (`US-001`)**:
  - Roles: `admin` (Super Admin), `teacher` (Lecturer/Manager), `player` (Student/Participant — PIN join, no account required).
  - Super Admin bootstrapped automatically from environment (`ADMIN_USERNAME`, `ADMIN_PASSWORD` / `MANAGER_PASSWORD`).
  - Admin can create/deactivate/delete `teacher` (or `admin`) accounts, reset passwords, and toggle/manage the **Teacher Invite Code** (`app_settings.teacher_invite`) so teachers can self-register without SMTP.
  - Teachers & Admins can change their own passwords (`min 8` chars, `crypto.scrypt` memory-hard hashing with per-user random salt & `timingSafeEqual`).
  - Session revocation enforced via `users.session_version` & `users.active` check on authenticated manager/admin requests.
  - Strict `owner_id` isolation across `quizzes`, `results`, and `media_files` (each teacher only accesses/edits/deletes/hosts their own resources).
  - PostgreSQL (`DATABASE_URL`) storage engine with idempotent startup auto-migration (`CREATE TABLE IF NOT EXISTS`).
- [ ] **Quiz Branding with TUAF Color Palette & Manager UI (`US-002`)**:
  - App name: **`Quiz`**, custom geometric SVG Logo & Favicon designed in TUAF colors.
  - TUAF color palette: Primary Emerald/Forest Green (`#15803d` / `#16a34a`), Secondary Deep Forest (`#071e12`), Gold/Amber accents (`#eab308` / `#f59e0b`), crisp vector/gradient game background.
  - Vietnamese (`vi`) set as default fallback language while maintaining 100% key parity across all 9 locales (`locales.test.ts`).
  - Updated `/manager` Auth UI (Sign In tab + Register with Invite Code tab) and `/manager/config` Dashboard (Account header + Change Password + Admin "Accounts & Invite Code" tab).
- [ ] **Production Readiness for `quiz.hoclieu.id.vn` & TUAF `production.md` (`US-003`)**:
  - `GET /health` returning `200 {"status":"healthy","version":"..."}` (both Hono `/api/health` and Nginx `location = /health`).
  - `Dockerfile` compatible with both standard Docker and BuildKit + `HEALTHCHECK`, proxy headers (`X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`) & security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`) in `docker/nginx.conf`.
  - Production compose templates (`compose.prod.yml` for `quiz.hoclieu.id.vn` & TUAF `tuaf-ai-network`) and `.github/workflows/ghcr.yml` pushing to `ghcr.io`.
  - Live preview updated with real PostgreSQL 15 (`quiz_db` / `quiz_user`) and verified online.

## Context & Authority

- Authority: User specification + `production.md` + `core/HARNESS.md` & `core/WORKFLOW.md`
- Risk lane: `high-risk` (touches Auth, Authorization/RBAC, PostgreSQL Data Model, Public API & UI)
- Stories: `US-001`, `US-002`, `US-003`
- Decision: `docs/decisions/0001-multi-account-postgres-architecture.md`

## Approach

1. **Phase 1 (`US-001` — Common Contracts & PostgreSQL Backend)**:
   - Add `postgres` client package to `@razzia/socket`.
   - Extend `@razzia/common` auth types & Zod validators (`SESSION_ROLES`: `player`, `teacher`, `admin`; login, invite-register, change-password, admin user CRUD & invite-settings schemas).
   - Build `packages/socket/src/services/password.ts` (`scrypt` + `timingSafeEqual`), `rate-limit.ts` (auth endpoint brute-force guard), and `storage/` (`PostgresStore` when `DATABASE_URL` is configured + compatible `MemoryFileStore` when `DATABASE_URL` is omitted in unit tests).
   - Wire `ownerId` (`claims.sub`) into `quizz`, `results`, `media`, and `games` (`saveResult` records `game.manager.clientId` as `ownerId`).
   - Add `/api/auth/login`, `/api/auth/register`, `/api/auth/me`, `/api/auth/password`, `/api/auth/invite-status` (boolean whether invite signup is enabled), and `/api/admin/*` (`users`, `invite`). Keep legacy `/api/auth/manager` working against Super Admin password for backward compatibility if needed.
2. **Phase 2 (`US-002` — Branding `Quiz` + TUAF Colors + Multi-Account UI)**:
   - Update `packages/web/src/index.css`, `packages/web/index.html`, `packages/web/src/i18n.ts` (`fallbackLng: "vi"`), `packages/web/src/assets/logo.svg`, `packages/web/public/icon.svg`, `Background.tsx`, and `GameBackground.tsx`.
   - Build Manager Login / Invite Registration card (`ManagerAuthForm.tsx`), Account Password modal/panel, and Admin Users & Invite Code tab (`ConfigUsers.tsx`).
   - Update all 9 locale folders (`vi`, `en`, `de`, `es`, `fr`, `it`, `ja`, `pl`, `tr`) to maintain 100% translation key parity.
3. **Phase 3 (`US-003` — Production Hardening & Live Online Preview)**:
   - Update `docker/nginx.conf`, `Dockerfile`, `.env.example`, `compose.prod.yml`, `nginx.quiz.hoclieu.conf` (reference snippet for `quiz.hoclieu.id.vn`), and `.github/workflows/ghcr.yml`.
   - Provision isolated `quiz_db` & `quiz_user` in PostgreSQL 15, rebuild `packages/socket` & `packages/web`, restart `razzia-preview`, and verify end-to-end online.

## Invariants & Risk

- **Invariants to preserve**:
  - Live game WebSocket state (`Game`, `PlayerManager`, `RoundManager`, `Registry`) remains in-memory and isolated per `manager.clientId`.
  - Students (`player` role) join games via 6-digit PIN without needing an account.
  - Every `teacher` can ONLY list, view, edit, delete, or host quizzes/results/media where `owner_id = claims.sub`.
  - All SQL queries MUST be parameterized (tagged templates via `postgres`), never concatenated.
  - All 9 locale directories MUST have identical key sets (`locales.test.ts`).

## Verification Plan

### Functional & Unit Tests

- `pnpm test` (`vitest run`): all existing tests + new multi-account auth, invite registration, RBAC tenant isolation, session revocation, and locale parity tests pass.
- `pnpm lint` (`oxlint`) & `pnpm build` pass cleanly with zero errors.

### Security Verification Section (`mandatory-secure-web-skills`)

- **Password & Cryptography**: Verify `crypto.scrypt` with unique 16-byte random salt, `timingSafeEqual`, minimum 8-char password validation, no plaintext password logging, and cryptographic RNG fallback warning for `JWT_SECRET`.
- **SQL Injection Prevention**: Verify 100% parameterized queries using `postgres` tagged templates (`sql\`...\``); SQL errors caught and mapped to generic symbolic error keys (`errors:api.serverError`).
- **Session Revocation & RBAC**: Verify `session_version` increments on logout, password change, and account deactivation, immediately invalidating old JWTs; verify Teacher A receives `404`/`401` when attempting to read/modify/delete Teacher B's quiz, result, or media, and `403`/`401` on `/api/admin/*`.
- **Rate Limiting & Brute-Force Mitigation**: Verify login & invite-registration endpoints enforce IP/account rate limiting (`429 errors:auth.tooManyAttempts`).
- **XSS, File Upload & Headers**: Verify React JSX escaping (no `dangerouslySetInnerHTML`, no `innerHTML`, no native `alert`/`confirm`/`prompt`), magic-byte validation on media upload (`file-type`), configurable `MAX_MEDIA_SIZE_MB`, and `X-Content-Type-Options: nosniff` + `X-Frame-Options: SAMEORIGIN` in Nginx.
- **Automated Security Check**: SecureCoder sidecar checked (`NO_SECURECODER_SIDECAR` in CLI PTY environment -> manual design-level security audit executed against all new files).

## Progress

- [x] Initial design and verification steps
- [ ] Implementation (`US-001`, `US-002`, `US-003`)
- [ ] Validation & Live PostgreSQL Preview

## Recovery & Rollback

- All source edits are isolated in workspace git; database schema uses non-destructive `CREATE TABLE IF NOT EXISTS` inside dedicated `quiz_db` owned by `quiz_user`. Rollback via `git checkout` and container restart if interrupted.

## Validation

- Proof command: `PATH="/home/trieuhoa/.nvm/versions/node/v24.16.0/bin:$PATH" pnpm test && pnpm lint && pnpm build` + live HTTP checks on `/health`, `/api/auth/login`, `/api/auth/register`, and tenant isolation.
