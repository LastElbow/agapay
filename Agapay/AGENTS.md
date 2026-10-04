# AGENTS.md — Agapay (mobile/web frontend)

Expo SDK 54 / React Native 0.81 app with Expo Router v6, TypeScript (strict), TanStack Query v5, Axios, SignalR, NativeWind (installed), MobX (partial). Runs on iOS, Android, and web. Monorepo rules: see `../AGENTS.md`.

## Commands

```bash
npm test                      # jest-expo, runs co-located *.test.ts(x)
npm run lint                  # expo lint
npx tsc --noEmit              # type-check (do this after edits)
npm run web                   # dev server, web at localhost:8081
npm run e2e:onboarding        # smoke scripts in scripts/ (need a reachable backend)
```

Path alias: `@/*` maps to this folder root (configured in `tsconfig.json`, `babel.config.js`, and jest `moduleNameMapper`). **Always use `@/` imports in new code**; some older files use relative `../../` — don't propagate that style.

## Layer architecture (follow this for new code)

```
app/<routes>                    Expo Router screens — routing + composition only.
                                Any default-export file under app/ becomes a route —
                                never colocate components inside app/.
  └─ uses → src/hooks, src/services (via React Query), src/stores
src/services/<domain>.ts        IO layer: axios/SignalR/Supabase calls, DTO mapping,
                                exports query keys (e.g. upcomingSessionsQueryKey)
  └─ uses → api/client.ts (the ONLY axios instance)
src/features/<domain>/core/     PURE business logic: no React, no RN, no axios.
                                Co-located *.test.ts. Imports only ports.
src/features/<domain>/screens/  Screen-specific components extracted from app/ files
                                (e.g. src/features/sessions/screens/session-view/)
src/shared/ports/               Interfaces for clock/scheduler/http/storage
src/test/fakes/                 FakeClock, FakeHttp, FakeScheduler, FakeStorage…
src/providers/                  AuthProvider, RoleProvider, AuthGate (route guard),
                                NetworkProvider, DebugLogProvider, notification &
                                suspension contexts
src/stores/                     MobX stores for multi-step onboarding drafts
src/constants/                  Static data (serviceCatalog, cancellationReasons)
src/components/                 Shared UI components (flat)
api/client.ts                   Axios singleton: token refresh, 429 backoff,
                                rate limiting, 403-suspension emission
```

Rules:

- **New business logic goes in `src/features/<domain>/core/` as pure functions with co-located tests.** Anything needing IO stays in `src/services/`. This split is the most valuable convention in the repo — preserve it.
- **Screens fetch via React Query hooks calling service functions** (see `src/services/sessions.ts` for the pattern: typed fns + exported query keys). Some older screens call `apiClient` directly from effects — acceptable to match when editing them line-by-line, but don't start new code that way.
- **Realtime:** never create SignalR connections directly. Use `src/services/signalrManager.ts` (reference-counted shared connections) through the `src/hooks/use*Realtime.ts` hooks.
- **Platform splits** use file suffixes: `WebMap.native.tsx` / `WebMap.web.tsx`, `useNetworkConnection.native.ts` / `.ts`, `index.web.tsx`. Prefer this over `Platform.OS` branches inside one file.

## Routing & auth

- Route groups: `app/(auth)`, `app/(patient)`, `app/(therapist)`, `app/(public)`, plus shared root-level screens (`session-view.tsx`, `messages/`, …) reachable by both roles.
- `src/providers/AuthGate.tsx` owns all post-login redirects (role → tabs, onboarding-incomplete → onboarding flow, verification status handling). Redirect logic is in `src/providers/authGateRouting.ts` (pure, tested) — extend it there, not inline in the component.
- Onboarding-completeness flags come from the API in **both casings** (`isPatientOnboardingComplete` / `IsPatientOnboardingComplete`). Until the User type is centralized, preserve the dual fallback `(user as any)?.x ?? (user as any)?.X` when reading new user fields.

## Testing

- Unit tests sit **next to the source** (`foo.ts` → `foo.test.ts`), testing the pure `core/` modules via port fakes. `components/MessageComposer.test.tsx` is the only RN-component test.
- Backend down? Unit tests must still pass — they never touch the network.

## Gotchas (read before editing)

1. **Mega-screens:** `app/session-view.tsx` (~5k lines), `create-session.tsx` (5.4k), `session-detail.tsx` (4.3k), `src/components/ConversationView.tsx` (2.9k). Keep edits surgical; when adding substantial UI, extract a child component into `src/features/<domain>/screens/` instead of growing these files. `session-view`'s map + formatting helpers are already extracted to `src/features/sessions/screens/session-view/`; its three modals are still inline and heavily coupled (next extraction candidates). **`EmbeddedLocationMap` exists in three drifted copies** (`src/components/`, `src/features/sessions/screens/session-view/`, inline in `create-session.tsx`) — don't create a fourth; unify only with runtime testing.
2. **Renamed twins:** the old `StepIndicator`/`StepIndicator2` are now `src/components/StepDots.tsx` (**1-based** `currentStep`) and `src/components/StepBars.tsx` (**0-based**). The old route `edit-profile2` is now `/(therapist)/edit-therapist-profile` (the name exists because `(patient)/edit-profile` owns `/edit-profile`).
3. **Typed user payload:** use `AuthUser` from `src/features/auth/core/user.ts` instead of `as any` casts. Some legacy payload keys exist in both camelCase and PascalCase — keep the `??` dual fallbacks when reading those.
4. **Styling:** `src/theme.ts` exists but most of the app hardcodes hex colors and inline `style={{}}`. Match the surrounding file; don't introduce theme imports (or hex) wholesale in one PR.
5. **Fonts:** loaded in `app/FontLoader.tsx`; family keys in `src/theme.ts` `FONTS` (e.g. `Inter_400Regular` — note the `RALeway_BOLD` typo is an existing key; don't "fix" without updating consumers).
6. **Rate limiter:** `api/client.ts` queues all requests through one interceptor (8 req/s burst). Auth endpoints are exempt. Don't add parallel axios instances — that's what this prevents.
7. **Secrets committed:** `.env` and `app.development.json` (Mapbox tokens incl. a secret `sk.` token) are tracked in git. Never print or copy their values; new config goes in `EXPO_PUBLIC_*` env vars or `app.config.js` extras.
8. **Suspension flow:** 403 responses with `error: "AccountSuspended"|"AccountBanned"` emit through `onSuspensionDetected` in `api/client.ts` → `src/providers/SuspensionContext.tsx` → `app/suspension.tsx`. Don't intercept 403s elsewhere.
9. `AuthGate` references `/signup-step3`, which has no route file — known drift.
10. Lots of `console.log/warn/error` calls exist (~570). Don't add new ones to committed code paths; use `src/providers/DebugLogProvider.tsx` for debug logging.
