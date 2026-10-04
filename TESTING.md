# Agapay — Frontend ↔ Backend Interop Testing

Runbook for verifying that both frontends and the backend still interoperate seamlessly (originally created to validate the 2026-10 backend refactor). Three levels: **(1)** automated HTTP contract tests, **(2)** Node E2E flows, **(3)** a manual UI smoke. All levels run against the **refactored backend locally** with a disposable InMemory database — no production data is touched.

## Level 0 — Start the disposable local backend

```bash
cd agapay-backend/agapay-backend
ASPNETCORE_ENVIRONMENT=Testing ASPNETCORE_URLS=http://localhost:5211 \
  Seed__Enabled=true Seed__AdminUser=true dotnet run --no-launch-profile
```

- `Testing` env ⇒ EF **InMemory** database (nothing touches Supabase Postgres).
- `Seed__Enabled=true` ⇒ the test-only seed hook in `Program.cs` loads roles, the admin user, and the defense demo data (therapists/patients/contracts/sessions).
- Real **Supabase storage** values are read from the gitignored `appsettings.Local.json` — uploads behave like production and land in the real bucket (GUID file names; ignorable).
- Sanity check: `curl http://localhost:5211/api/Sessions/server-time`.

## Level 1 — Automated contract tests

```bash
cd agapay-backend
dotnet test        # 124 tests: 49 unit/integration + 75 wire-contract tests
```

The contract tests (files matching `*ContractTests.cs`) talk to the real pipeline over HTTP and assert **raw JSON field names** — they fail if any response field the frontends parse drifts. Key frozen contracts: the 30-field session summary, 57-field session detail, `AuthResponseDto` field set, chat history/summary shapes, admin submissions/reports shapes, suspension 403 shape, `VALIDATION_ERROR`/`INTERNAL_ERROR` bodies, SignalR negotiate auth matrix, and the PascalCase request bodies the app still sends (create session/contract, blueprint, ratings).

The rate limiter is skipped in the Testing environment (hardcoded 100 req/min/IP would 429 any suite).

## Level 2 — Node E2E flows (real client code paths)

From `Agapay/` (default target `http://localhost:5211`, override with `AGAPAY_API_BASE_URL`):

```bash
npm run e2e:auth                    # signup → OTP(123456) → login → refresh
npm run e2e:onboarding:patient      # patient profile + selfPatientId
npm run e2e:onboarding:therapist    # multipart license upload ⚠️ needs valid Supabase key
npm run e2e:profile:edit            # ⚠️ uploads license first
npm run e2e:scheduling:availability # ⚠️ uploads license first
npm run e2e:scheduling:create-session
npm run e2e:chat:smoke              # real SignalR client, two users, message round-trip
npm run e2e:session-proposal / e2e:scheduling:reschedule / e2e:sessions:lifecycle
```

**Latest run results (2026-10-04, local Testing backend):** `e2e:auth` ✅ · `e2e:onboarding:patient` ✅ · `e2e:chat:smoke` ✅ (real SignalR WebSocket round-trip). The upload-dependent scripts were **blocked by an invalid `Supabase:ServiceRoleKey`** in `appsettings.Local.json` (Supabase answers `Invalid key` / `Invalid Compact JWS`) — put the project's current service-role key in `appsettings.Local.json` and re-run; nothing else is required.

## Level 3 — Manual UI smoke (checklist)

Start the backend as above, then:

**Admin portal** (separate terminal):
```bash
cd agapay-admin
VITE_API_URL=http://localhost:5211/api npm run dev   # → http://localhost:5173
```
- [ ] Login `admin@demo.agapay.com` / `Password123!` (seeded by `Seed__AdminUser=true`)
- [ ] Submissions list + detail render (therapist rows from demo seed)
- [ ] Approve/reject a verification
- [ ] Reports list + stats render
- [ ] Warn / suspend / restore a user

**Mobile/web app** (separate terminal):
```bash
cd Agapay
EXPO_PUBLIC_API_URL=http://localhost:5211 npm run web   # → http://localhost:8081
```
- [ ] Patient login (any seeded `*@demo.agapay.com` patient / `Password123!`)
- [ ] Home shows upcoming sessions (defense demo sessions exist for today)
- [ ] Recommendation flow (set preferences → ranked therapists)
- [ ] Chat: send/receive over SignalR (open two browsers — patient + therapist)
- [ ] Notifications screen
- [ ] Profile edit + save
- [ ] Session detail → cancel

## Documented findings (pre-existing, deliberately not "fixed" by the test effort)

1. **Suspension-status endpoint is unreachable for the app** — the mobile app calls `/api/users/suspension-status` (plural) which matches **no route** (real route: `/api/User/suspension-status`, 404 always); and `SuspensionCheckMiddleware` allow-lists only the plural path, so while actually suspended even the real route returns `403 AccountSuspended` instead of status data. Net effect: the in-app suspension screen can never load status (the app tolerates the 404 as "not suspended"). Suggested fix (out of scope here): correct the URL in `SuspensionContext` and add the singular path to the middleware allow-list.
2. **SignalR hub auth gap** — the JWT query-string map (`Startup/AgapayServiceCollectionExtensions.cs`) covers only `/hubs/chat`, `/locationhub`, `/hubs/contracts`, `/hubs/sessions`, `/hubs/colleagues`. The app connects to all 7 hubs with `?access_token=`, so **`/hubs/notifications` and `/hubs/ratings` reject the connection** — `NewNotification`, `ForceLogout` and `RatingSubmitted` pushes never arrive (unread counts still work via 60–120 s polling). Bearer-header auth works on all 7. Suggested fix: add the two paths to `OnMessageReceived`.
3. **Admin submissions list omits `licensePreviewUrl`/`licenseImagePath`/`verificationStatus`** (they exist only on the detail endpoint) — list rows can't render thumbnails.
4. **Chat delete returns `{conversationId, message}`** but the app reads `messagesDeleted ?? 0` — the UI always shows 0 deleted.
5. **Listeners without senders** (benign): sessions hub `CancellationAcknowledged`, `SessionUpdated`, `SessionLogAdded`; contracts hub `ProposalCreated`, `ProposalAccepted`, `ProposalRejected`.
6. **Dead endpoints**: `GET /api/Contracts/therapist/unreviewed` requires role `"Therapist"` (never seeded → always 403); `POST /api/Chat/unblock` doesn't exist (the app uses `DELETE /api/Chat/block/{id}`).
7. `POST /api/Sessions/{id}/log-today` binds `DateTime` fields — `"HH:mm"` strings are rejected; clients must send ISO datetimes.
