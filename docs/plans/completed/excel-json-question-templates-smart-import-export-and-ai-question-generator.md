# Excel & JSON Question Templates, Smart Import/Export, and AI Question Generator

## Outcome

- [x] Lecturers can download ready-to-use **Excel (`.xlsx`)** (with styled `Cau_Hoi` & `Huong_Dan` sheets covering `single`, `multi`, and `estimation` questions) and **JSON (`.json`)** templates in 1 click.
- [x] Lecturers can import questions from **`.xlsx`**, **`.csv`**, or **`.json`** with live preview, subject editing, and clear row-by-row validation diagnostics, both from the **Bộ đề (`ConfigManageQuizz`)** dashboard (create new / open in editor) and inside **`QuizzEditorSidebar`** (append into active quiz).
- [x] Lecturers can export any existing quiz to either **Excel (`.xlsx`)** or **JSON (`.json`)**.
- [x] Lecturers can generate validated questions automatically via **"✨ Tạo bằng AI"** (topic + optional lecture notes/material, question count, question type, Bloom difficulty level, time per question, language) powered by any OpenAI-compatible AI provider (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`).
- [x] Super Admin can centrally manage AI settings (enable/disable, Base URL, API Key with server-side masking, live model discovery from `/models`, default model) in the Admin dashboard (`ConfigUsers.tsx`), persisted in PostgreSQL `app_settings` with `.env` bootstrap defaults.

## Context & Authority

- Authority: User request + `core/HARNESS.md` + `core/WORKFLOW.md` + `production.md`
- Risk lane: `normal`
- Stories: `US-004` (Templates & Smart Import/Export), `US-005` (AI Question Generator & Admin Config)

## Approach

1. **Zero-Dependency Hardened Spreadsheet & Template Engine (`packages/common/src/quizz-io/`)**:
   - Build a pure-TypeScript ECMA-376 `.xlsx` writer & reader using Web/Node-native `CompressionStream("deflate-raw")` / `DecompressionStream("deflate-raw")` + CRC32 + hardened XML cell parser (zero DTD/XXE, zip-slip allow-list, 5 MB uncompressed cap) — avoiding vulnerable third-party `xlsx` packages.
   - Support `.xlsx`, `.csv` (RFC 4180 UTF-8 BOM), and `.json` (both full `Quizz` object and `{ questions: [...] }` / legacy formats via `normalizeLegacyQuizz` + `quizzValidator`).
   - Provide 1-click generators for `quiz-template.xlsx` (`Cau_Hoi` + `Huong_Dan` sheets) and `quiz-template.json`, plus `exportQuizzToXlsx(quizz)`.
2. **Backend OpenAI-Compatible AI Service & Admin Config (`packages/socket/`)**:
   - Env vars in `env.ts`: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` (never hardcoded in code; stored in `.env` or PostgreSQL `app_settings` key `ai_provider`).
   - Endpoints:
     - `GET /api/ai/status` (`requireManager`): returns `{ enabled: boolean, model: string }` (never leaks API key or internal URL to regular lecturers).
     - `POST /api/ai/generate` (`requireManager` + sliding-window rate limit `10 req/min`): calls upstream `/chat/completions`, extracts & normalizes JSON, validates every generated question through `quizzValidator`, and returns `{ subject, questions }`.
     - `GET /api/admin/ai`, `PATCH /api/admin/ai`, `POST /api/admin/ai/models` (`requireAdmin`): returns masked key (`sk-...XXXX`), saves updated settings, and fetches live chat models from `/models` (filtering out image-only models).
3. **Frontend Modals, Editor Integration & 9-Locale Parity (`packages/web/`)**:
   - `ImportQuizzModal.tsx`: Drag-and-drop / file picker for `.xlsx`, `.csv`, `.json`, template download buttons (`.xlsx` & `.json`), row-level error list, preview summary, and actions ("Mở chỉnh sửa" / "Lưu ngay" or "Chèn vào đề").
   - `AiGenerateModal.tsx`: Topic, optional source text/material (up to 12,000 chars), count (1–20), question type (`mixed`, `single`, `multi`, `estimation`), difficulty (`easy`, `medium`, `hard`, `bloom`), time limit, and language.
   - `ConfigManageQuizz.tsx`: Replace raw JSON upload with `ImportQuizzModal`, add `AiGenerateModal` button (when AI enabled), and upgrade Export button with Excel `.xlsx` / JSON menu.
   - `QuizzEditorSidebar.tsx` & `quizz-editor-context.tsx`: Add `appendQuestions`, `ImportQuizzModal` (append mode), and `AiGenerateModal` (append mode), plus draft handoff store `quizz-draft.ts`.
   - Sync all new i18n keys across all 9 locales (`vi, en, de, es, fr, it, ja, pl, tr`).

## Security Verification Plan

- **Secrets Protection (BFF Pattern)**: `AI_API_KEY` is never hardcoded in source code, never logged, and never returned in plaintext to the browser (`GET /api/admin/ai` returns `hasApiKey` + `apiKeyMasked`). All AI calls execute server-side in `@razzia/socket`.
- **SSRF & URL Validation**: `AI_BASE_URL` validated strictly as `http:` or `https:` URL, blocking non-HTTP schemes and cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`). Only `admin` role can view or modify `baseUrl`.
- **XML & ZIP Hardening (`.xlsx`)**: Custom OOXML parser disables DTD/ENTITY/XInclude by design (rejects `<!ENTITY` / `<!DOCTYPE`), enforces strict ZIP entry allow-list (`xl/sharedStrings.xml`, `xl/workbook.xml`, `xl/worksheets/sheet*.xml`), caps compressed/uncompressed bytes (`<= 5 MB`) to prevent Zip Bomb DoS, and validates all cells through Zod `quizzValidator`.
- **XSS & Rate Limiting**: React JSX auto-escaping only (no `dangerouslySetInnerHTML`, no `innerHTML`, no native `alert`/`confirm`/`prompt`); `POST /api/ai/generate` protected by `requireManager` + IP/user rate limit (`10/min`) and prompt length bounds.

## Progress

- [x] Intake, durable plan, stories `US-004` & `US-005`, live `/v1/models` & `/v1/chat/completions` probe
- [ ] Phase 1 (`US-004` part 1): `@razzia/common` `.xlsx` / `.csv` / `.json` parser, exporter, templates & unit tests
- [ ] Phase 2 (`US-005` part 1): `@razzia/socket` AI service, Admin AI settings storage, routes & integration tests
- [ ] Phase 3 (`US-004` + `US-005` UI): Frontend `ImportQuizzModal`, `AiGenerateModal`, Export `.xlsx`/`.json`, Admin AI panel & 9 locales
- [ ] Phase 4: Full Vitest suite, `oxlint`, production build, live PostgreSQL + AI provider verification

## Recovery & Rollback

- All AI settings and spreadsheet utilities are additive; `.env` holds runtime credentials outside Git.

## Validation

- Proof command: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 PATH="/home/trieuhoa/.nvm/versions/node/v24.16.0/bin:$PATH" pnpm test && pnpm lint && pnpm build`
