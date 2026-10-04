# AGENTS.md — Agapay Capstone Monorepo

Instructions for AI coding agents working in this repository. Each subproject has its **own AGENTS.md with more detail — always read it before editing that project**.

## Repository layout

| Folder | What it is | Stack |
|---|---|---|
| `Agapay/` | Patient & therapist mobile + web app (the "frontend") | Expo SDK 54, React Native 0.81, Expo Router v6, TypeScript |
| `agapay-admin/` | Admin web portal (therapist verification, condition curation, reports) | Vite 7, React 19, TypeScript, Tailwind |
| `agapay-backend/` | REST API + SignalR realtime server | .NET 9, ASP.NET Core, EF Core 9, PostgreSQL (Supabase) |

Single git repo rooted here. `Capstone.sln` groups both backend projects; each subproject also builds independently.

## Deployment reality

- The backend and database run live in the cloud: API at `https://agapay-backend-production.up.railway.app` (Railway), Postgres + file storage on Supabase.
- **Both frontends default to the production URL** (hardcoded fallback in `Agapay/api/client.ts` and `agapay-admin/src/api/apiClient.ts`). Local backend runs at `http://localhost:5211` if you start it yourself.
- Root `README.md` is an evaluator-facing setup guide (cloud-first, no local backend required).

## Commands

| Task | Where | Command |
|---|---|---|
| Backend tests | `agapay-backend/` | `dotnet test` |
| Backend run | `agapay-backend/` | `dotnet run --project agapay-backend` |
| Frontend unit tests | `Agapay/` | `npm test` (jest-expo) |
| Frontend lint | `Agapay/` | `npm run lint` |
| Admin dev server | `agapay-admin/` | `npm run dev` (port 5173) |
| Admin build (type-checks) | `agapay-admin/` | `npm run build` |
| Admin lint | `agapay-admin/` | `npm run lint` |

The admin app has **no test suite**; its only gates are `npm run build` (runs `tsc -b`) and `npm run lint`.

## Cross-cutting rules

1. **Never commit, print, copy, or propagate secrets.** Real credentials are committed in several legacy files (`Agapay/.env`, `Agapay/app.development.json`, `agapay-backend/agapay-backend/appsettings.Development.json`). Treat their values as compromised: do not echo them into output, new files, logs, or other environments. New secrets go in gitignored config (`appsettings.Local.json`, untracked `.env`, EAS/env vars).
2. **Error contract is load-bearing.** The backend returns `ErrorResponseDto { code, message, details }` (camelCase JSON) — not ProblemDetails. Account suspension/ban is a **403** with body `{ error: "AccountSuspended" | "AccountBanned", message, suspensionDetails: {...} }` from `SuspensionCheckMiddleware`. Both frontends parse these exact shapes. Do not change them without updating all three projects.
3. **Role names are fixed strings** (seeded in `agapay-backend/SeedData.cs`): `"Admin"`, `"User"`, `"Patient"`, `"PhysicalTherapist"` — note it is `PhysicalTherapist`, never `Therapist`.
4. **JSON casing:** backend serializes camelCase globally with string enums; C# DTO properties are PascalCase. The RN app receives camelCase but some legacy user fields exist in both casings — see `Agapay/AGENTS.md` gotchas.
5. **API path casing is inconsistent but intentional**: most controllers use `api/[controller]` (→ `/Admin/...`), except `AdminConditionsController` → `/api/admin/conditions`. Preserve whatever a given service file already uses.
6. **Match the surrounding file's style** (quotes, semicolons, indentation, inline-vs-sheet styling). Several projects have mixed formatting and no formatter config; do not reformat or "modernize" whole files — it produces unreviewable diffs.
7. **SignalR hub URLs** are `/hubs/{name}` for chat, contracts, sessions, ratings, colleagues, notifications and `/locationhub` (no prefix) for location. Clients depend on this.
8. Docs in the root (`DPIA_*.md`, `RA_*.md`, `PDIM_*.md`) are thesis privacy/risk documents, not code documentation — don't treat them as specs.
