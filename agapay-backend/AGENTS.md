# AGENTS.md — agapay-backend (API server)

.NET 9 ASP.NET Core Web API: REST + SignalR, EF Core 9 with Npgsql (PostgreSQL hosted on Supabase), ASP.NET Identity + JWT bearer auth, Scalar API docs in Dev. Deployed to Railway via the root `Dockerfile` (port 8080). Monorepo rules: see `../AGENTS.md`.

> **2026-10 refactor:** the backend was restructured from "logic-inline controllers" to a service-layer architecture. Controllers are now thin adapters; business logic lives in `Services/<Domain>/`. The section below reflects the NEW structure.

## Commands

```bash
dotnet test                              # xUnit v3 tests (from agapay-backend/ — its own .sln)
dotnet run --project agapay-backend      # local API: http://localhost:5211 / https://localhost:7058
dotnet ef migrations add <Name> --project agapay-backend   # EF tooling required
dotnet build                             # build check
```

## Projects

- `agapay-backend/` — the API (20 controllers, 7 SignalR hubs, 41 EF migrations)
- `agapay-backend.Tests/` — xUnit **v3** tests: integration via `WebApplicationFactory<Program>` (`AuthApiFactory.cs`, `Testing` env + EF InMemory) AND direct controller instantiation tests over InMemory DB. `Program.cs` ends with `public partial class Program { }` — required by the test factory, don't remove.

## Architecture — read before adding endpoints

**Controllers are thin adapters.** They own only: route attributes, `[FromBody]`/route binding, `[Authorize]` role-gating, and mapping a service result (`XActionResult(int StatusCode, object? Payload)`) to `IActionResult`. All business logic, queries, state transitions and SignalR broadcasts live in domain services. New endpoints: add a method to the relevant service (create one under `Services/<Domain>/` if missing) and a 1–3 line controller action.

```
Program.cs      ~90-line composition: DI extension calls + pipeline order + hub mapping
Startup/        AgapayServiceCollectionExtensions.cs (all DI, grouped by concern);
                AgapayStartupTasks.cs (schema-drift DO $$ patch — DO NOT REMOVE, MigrateOnStartup, seeding)
Controllers/    thin adapters, api/[controller] routes (exception: AdminConditionsController → api/admin/conditions)
Services/       business logic, by domain: Sessions/ (session state machine — the single owner of
                TherapySession status transitions), Auth/, Admin/ (Verification, ReportModeration,
                AccountModeration), Chat/ (Conversation, Blocking, PatientContextEnricher),
                Contracts/ (ContractBlueprintService, SessionDaysParser), Profiles/ (ProfilePhotoService),
                Notifications/ (IRealtimeNotifier + SignalREvents constants), plus the older flat services
Common/         CurrentUser.cs (ICurrentUser — TryParse claim access, never Guid.Parse claims),
                ManilaClock.cs (single Asia/Manila TZ source), DateTimeUtils.cs, NameUtils.cs,
                CurrentTherapist.cs, Options/ (JwtOptions, SupabaseOptions, OtpOptions — IOptions pattern)
Models/         response DTOs; Models/Requests/ holds all request DTOs
Entities/       EF Core entities incl. Identity User/Role
Hubs/           one SignalR hub per domain; request payload types are nested classes inside the hub
Middleware/     ExceptionHandlingMiddleware (first in pipeline, JSON 500 INTERNAL_ERROR) +
                SuspensionCheckMiddleware (see error contract below)
Data/           agapayDbContext + SeedData (partial class; DemoData split out)
Migrations/     NEVER hand-edit; regenerate with dotnet ef
```

Service pattern: scoped, ctor-injected deps, methods end in `Async`, take `ClaimsPrincipal user` as an explicit parameter (never IHttpContextAccessor) when role/claim branching is needed, and return an `XActionResult`-style record that the controller maps 1:1 to preserve response shapes.

## Contracts the frontends depend on (do not change unilaterally)

- **Errors:** `ErrorResponseDto { code, message, details }` (camelCase) or ad-hoc anonymous objects — match the endpoint's existing shape. Unhandled exceptions return `{ code: "INTERNAL_ERROR", ... }` 500 via ExceptionHandlingMiddleware. Model-binding failures return `{ code: "VALIDATION_ERROR", message, details }` 400 (InvalidModelStateResponseFactory in Startup/).
- **Suspension:** 403 with `{ error: "AccountSuspended" | "AccountBanned", message, suspensionDetails }` from `Middleware/SuspensionCheckMiddleware.cs` (which also auto-lifts expired suspensions and allow-lists `/api/auth/logout|refresh|me`, `/api/users/suspension-status`, notifications paths).
- **JSON:** camelCase globally with **string enums** (`Startup/AgapayServiceCollectionExtensions.cs → AddAgapayApiDefaults`). C# DTO properties stay PascalCase; don't add `[JsonPropertyName]` selectively.
- **Roles:** `"Admin"`, `"User"`, `"Patient"`, `"PhysicalTherapist"` (never "Therapist") — seeded in `Data/SeedData.cs`.
- **JWT for SignalR:** access token read from `access_token` query string in `OnMessageReceived` — currently covers only 5 of 7 hub paths (ratings & notifications omitted) in `Startup/AgapayServiceCollectionExtensions.cs`. If you touch hub auth, know this map first.
- **SignalR events:** all client event names are constants in `Services/Notifications/SignalREvents.cs` — use them, never raw strings. Sends go through `IRealtimeNotifier` (swallows + logs hub failures so a broadcast error never fails a committed DB write).
- **CORS policy `"AllowReactApp"`** is defined in code (`AddAgapayCors`), not in config files.

## Program.cs is small; Startup/ is where wiring lives

`Startup/AgapayStartupTasks.cs` contains a **hand-written startup `DO $$` SQL block that patches missing `PhysicalTherapists` columns** — a workaround for production schema drift. **Do not "clean it up" or remove it casually.**

## Config & secrets

- Local overrides: `agapay-backend/appsettings.Local.json` (gitignored) — template in `appsettings.Local.json.example`. `Program.cs` loads it optionally.
- `appsettings.Development.json` and `appsettings.json` are **placeholder skeletons** (real credentials were purged from git in the 2026-10 refactor — the previously committed values must be ROTATED). Production values come from Railway environment variables; local dev values go in `appsettings.Local.json`.
- Demo backdoors are config-gated (defaults preserve demo behavior): `Seed:BypassOtpForDemoAccounts` + `Otp:DemoFixedCodeEnabled` (fixed OTP "123456") and `Auth:DemoEmailBypassEnabled` (@demo.agapay.com skips 2FA login OTP). Set them false in production config to require real OTP.
- Seeded demo accounts use password `Password123!` (see `SEED_DATA_PLAN.md`).

## Gotchas

0. **Interop testing** — see root `TESTING.md` for the full runbook (disposable Testing-env local backend, 75 wire-contract tests in `agapay-backend.Tests/*ContractTests.cs`, Node E2E scripts, manual UI checklists) and the documented pre-existing bugs (suspension-status route/allow-list mismatch, hub query-token gap for notifications/ratings). The rate limiter is skipped in Testing env, and `Seed:Enabled=true` + `Seed:AdminUser=true` seed the InMemory DB at startup (test-only hooks in `Program.cs`).
1. **Session status has ONE writer:** `Services/Sessions/SessionService.cs`. All transitions — create, cancel (+reschedule-proposal state machine), reschedule approval, reliever swap, start/complete (Contracts routes delegate to it), and the 5 AM DoneForToday reset used by both background services — go through it. Add new transitions there, not in controllers.
2. **Error-contract shapes were audited and intentionally NOT unified** — e.g., ModerationController's report-status endpoint deliberately differs from Admin's (validation, reviewer parsing, response fields). Match the endpoint you're editing.
3. `AuthController`'s `UserType` string is computed differently per endpoint (some include the "User" base role, some filter it case-sensitively) — this is preserved, not a bug to fix casually.
4. **Indentation mixes 2-space and 4-space between files** (no .editorconfig). Match the file you're editing.
5. Migration names mix PascalCase and camelCase — either is fine; don't rename existing ones.
6. The Azure Web App workflow in `.github/workflows/` is historical; actual hosting is Railway (root `Dockerfile`).
7. `IRateLimiter` (InMemoryRateLimiter) is the only singleton app service; it self-sweeps idle keys.
8. `agapay-backend.http` has real endpoint examples with placeholders (no credentials).
9. Known follow-ups (documented, not yet fixed): patient PII in chat payloads / `Clients.All` location & rating broadcasts (need frontend listener audit), `SuspensionCheckMiddleware` hits the DB on every authenticated request (cacheable), legacy Register/RegisterPatient/RegisterTherapist flows duplicate signup logic (kept separate — behavior differs).
