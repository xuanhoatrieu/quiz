# ADR 0001: Multi-Account RBAC & PostgreSQL Storage Architecture

## Status

Accepted (2026-11-01)

## Context

Razzia v4.0.2 originally authenticated managers via a single shared `MANAGER_PASSWORD` environment variable and persisted all quizzes, game results, and media files into a shared `/app/config` directory without tenant ownership.

To deploy **Quiz** on `quiz.hoclieu.id.vn` and subsequently on TUAF Production Infrastructure (`production.md`, server `10.64.11.109` with shared PostgreSQL 15 `tuaf-supabase-db`), multiple lecturers need isolated accounts without introducing SMTP email complexity or breaking the frictionless PIN-based student join experience.

## Decision

1. **Roles & Onboarding (Option A)**:
   - Keep `player` accounts ephemeral/stateless (PIN + nickname join).
   - Introduce persistent accounts with two roles: `admin` (Super Admin, seeded automatically from `ADMIN_USERNAME` and `ADMIN_PASSWORD`/`MANAGER_PASSWORD`) and `teacher`.
   - Support two account provisioning flows managed by `admin` without SMTP:
     - Direct account creation & password reset by `admin` in the Manager dashboard.
     - Self-registration by teachers using an admin-controlled **Invite Code** (`app_settings.teacher_invite`).
2. **Session Revocation**:
   - Store `session_version` and `active` per user. Include `ver` (`session_version`) in `admin`/`teacher` JWT claims and verify against the active user record on authenticated requests so logout, password change, or account deactivation immediately revokes issued tokens.
3. **Storage Engine (Option A — PostgreSQL)**:
   - Use PostgreSQL (`DATABASE_URL`) via pure-JS `postgres` driver (compatible with `rolldown` single-file CJS bundle in Alpine Docker) with automatic idempotent startup migrations (`users`, `app_settings`, `quizzes`, `results`, `media_files`).
   - Keep binary media payloads on the mounted volume (`/app/config/media`) while tracking ownership (`owner_id`) and metadata in `media_files`.
   - Provide an identical in-memory/filesystem store fallback when `DATABASE_URL` is unset so unit/CI tests run fast without external services.
4. **Branding**:
   - Rebrand UI as **Quiz** using TUAF's signature Emerald/Forest Green & Gold palette, custom geometric SVG logo/favicon, and Vietnamese (`vi`) default fallback language.

## Consequences

- Every lecturer's quizzes, results, and uploaded media are strictly isolated by `owner_id`.
- Fully compliant with `production.md` (`GET /health`, shared Postgres isolation, Docker volume for media, Caddy proxy headers, GHCR CI/CD).
