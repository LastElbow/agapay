# AGENTS.md — agapay-admin (admin web portal)

Vite 7 + React 19 + TypeScript SPA for administrators: therapist verification, condition curation, user-report moderation. Tailwind CSS 3, axios, react-router-dom v7. **No test suite.** Monorepo rules: see `../AGENTS.md`.

## Commands

```bash
npm run dev        # dev server at http://localhost:5173
npm run build      # tsc -b && vite build — THE type gate, run after every edit
npm run lint       # eslint (flat config)
```

There is no test runner. Verify changes with `npm run build` + `npm run lint` + manual browser check (`npm run dev`).

## TypeScript config is strict and unusual

`tsconfig.app.json` enables `verbatimModuleSyntax` and `erasableSyntaxOnly`:

- **Type-only imports MUST use `import type { X }`** — plain imports of types fail the build.
- No enums, no namespaces, no parameter properties (erasable syntax only).
- `noUnusedLocals` / `noUnusedParameters` are on — remove unused vars or the build fails.
- **No path aliases.** All imports are relative (`../../api/apiClient`). Keep it that way; don't introduce aliases in one file.

## Layout & patterns

```
src/api/apiClient.ts            Shared axios instance (auth header from sessionStorage)
src/api/<domain>Service.ts      Per-domain typed service fns + interfaces. Pages never call axios directly.
src/context/AuthContext.tsx     Session state; useAuth() hook (throws outside provider)
src/routes/ProtectedRoute.tsx   Auth guard (redirects to /login)
src/pages/<Name>/<Name>.tsx     One folder per page, default export named like the file
src/components/dashboard/       Feature components, named exports via barrel index.ts
src/components/toast/           ToastProvider + useToast() — the notification system
```

- API base URL: `import.meta.env.VITE_API_URL`, defaulting to the production Railway URL (see `.env.example`; local backend is `http://localhost:5211/api`).
- Auth: JWT + refresh token stored in `sessionStorage` under `authToken` / `refreshToken` / `user`. **The refresh token is stored but never used — there is no refresh flow and no 401 interceptor.** Expired sessions surface as generic request errors; don't assume auto-logout happens.
- `sessionStorage.getItem("authToken")` is read by literal string in `apiClient.ts` and `DashboardPage.tsx` (duplicating `AUTH_TOKEN_KEY` from `AuthContext`). If you touch token storage, update all three places.

## Gotchas (read before editing)

1. **`src/pages/ReportsPage/ReportsPage.tsx` is ~1,136 lines with ~30 `useState` hooks and all modals inline.** Keep edits surgical; extract child components rather than growing it.
2. **Three styling regimes coexist** — Tailwind utilities (most files), a plain CSS file with BEM-ish classes (`ConditionCurationPage.css`, that page uses no Tailwind), and inline hex `style` objects in the dead `components/ui/` files. Match whichever the file you're editing already uses.
3. **Quotes/semicolons/indent are inconsistent between files** (some 2-space single-quote no-semi, some 4-space double-quote). Match the file; never reformat whole files.
4. **Export conventions are inconsistent**: pages default-export; `components/dashboard` uses named exports + barrel. Match your file's neighborhood. Note `DashboardPage.tsx` default-exports a function named `Dashboard`.
5. **API path casing is mixed and load-bearing**: `/Admin/submissions`, `/Admin/reports`, `/admin/conditions` (lowercase!). Preserve exactly per service file.
6. **Dead code — leave alone unless asked**: `components/ui/Button`/`Input` (never imported), `App.css` (0 bytes but still imported), `assets/react.svg`, legacy wrappers at the bottom of `submissionsService.ts` (`acceptSubmission`, `rejectSubmission`, … — zero callers). `mockSubmissions()` in the same file IS used as an offline fallback by DashboardPage.
7. `ConditionCurationPage` uses browser `alert()`/`confirm()` instead of the toast system used everywhere else. When editing it, matching its current style is acceptable; new pages should use `useToast()`.
8. Icons: `lucide-react` everywhere except `LoginPage`, which uses `react-icons/fa`. Match the file.
9. `LoginPage.tsx` ships with pre-filled demo credentials in the initial `useState` — do not treat as real secrets, but don't spread them into new files.
10. `submissionsService.ts` reads `import.meta.env.VITE_SUPABASE_URL` to expand relative image URLs — declared in neither `.env` nor `.env.example`; keep the fallback behavior working.
11. **No catch-all route** in `App.tsx` — unknown paths render blank. Any new page needs an explicit `<Route>` in `App.tsx`.
12. `.env` is git-tracked (only `VITE_API_URL`); `.gitignore` doesn't exclude plain `.env`. Don't put secrets in it.
