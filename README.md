# Agapay

**Agapay** is a capstone project: a platform that connects patients with licensed **physical therapists** for home-based therapy. Patients describe their condition and get matched with therapists, book recurring home sessions under a care contract, chat and share their location in real time during visits, and rate their care. Therapists manage their availability, service areas, contracts and sessions. An admin portal handles therapist license verification, condition curation and platform moderation.

| Project | What it is | Stack |
|---|---|---|
| [`Agapay/`](Agapay) | Patient & therapist app — Android/iOS via Expo Go, or web browser | Expo SDK 54, React Native 0.81, Expo Router v6, TypeScript |
| [`agapay-admin/`](agapay-admin) | Admin web portal (verification, reports, account moderation) | Vite 7, React 19, TypeScript, Tailwind |
| [`agapay-backend/`](agapay-backend) | REST API + SignalR realtime server | .NET 9, ASP.NET Core, EF Core 9, PostgreSQL (Supabase) |

## Architecture

```
┌────────────────────┐   ┌────────────────────┐
│   Mobile / Web app │  │   Admin portal     │
│   (Expo, port 8081)│   │   (Vite, port 5173)│
└─────────┬──────────┘   └─────────┬──────────┘
          │  REST + SignalR (JWT)  │
          ▼                        ▼
┌─────────────────────────────────────────┐
│  agapay-backend (.NET 9, port 5211)     │
│  Controllers → Services → EF Core 9     │
│  7 SignalR hubs (chat, sessions,        │
│  contracts, location, notifications, …) │
└───────────────────┬─────────────────────┘
                    ▼
      ┌──────────────────────────────┐
      │  Supabase: PostgreSQL +      │
      │  file storage (licenses,     │
      │  profile photos)             │
      └──────────────────────────────┘
```

Key backend design points (see [`agapay-backend/AGENTS.md`](agapay-backend/AGENTS.md)):

- **Controllers are thin adapters** — business logic lives in domain services under `Services/<Domain>/`. `SessionService` is the single owner of the session lifecycle (booking, cancellation/reschedule state machine, reliever substitution, auto-transitions).
- **Realtime** via SignalR: all client event names are constants in `SignalREvents`, sends go through `IRealtimeNotifier` so a broadcast failure never fails a committed request.
- **Error contract**: `ErrorResponseDto { code, message, details }`; a global `ExceptionHandlingMiddleware` turns unhandled exceptions into JSON 500s.
- Background hosted services handle session auto-transitions (start/end of day, 5 AM Manila reset) and weekly rescheduling of cancelled sessions.

## Quickstart (evaluator / demo)

The backend and database run live in the cloud — **no .NET install or local backend needed** to try the frontends. Both frontends are pre-configured to talk to the live API.

You need [Node.js 20 LTS](https://nodejs.org/) and two terminals:

**Terminal 1 — admin portal**

```bash
cd agapay-admin
npm install
npm run dev          # → http://localhost:5173
```

**Terminal 2 — mobile app**

```bash
cd Agapay
npm install
npm run web          # → http://localhost:8081 (in-browser)
# or: npm start      # then scan the QR code with the Expo Go app
```

**Demo accounts** — seeded accounts use `@demo.agapay.com` emails and the password `Password123!`:

| Role | Email | Password |
|---|---|---|
| Admin (portal) | `admin@demo.agapay.com` | `Password123!` |
| Patient / Therapist | see [`agapay-backend/SEED_DATA_PLAN.md`](agapay-backend/SEED_DATA_PLAN.md) | `Password123!` |

An internet connection is required (API + database are cloud-hosted).

## Running the backend locally (developer setup)

Requires the [.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0).

```bash
cd agapay-backend
dotnet run --project agapay-backend   # http://localhost:5211 (Scalar API docs at /scalar in Development)
dotnet test                           # xUnit v3 suite (integration + unit, EF InMemory)
dotnet ef migrations add <Name> --project agapay-backend
```

Configuration is layered: `appsettings.json` (placeholders) → `appsettings.Development.json` → gitignored `appsettings.Local.json` (optional; template in [`appsettings.Local.json.example`](agapay-backend/agapay-backend/appsettings.Local.json.example)). Put your local Supabase connection string, JWT signing key, Mailjet credentials and seed options there — **never commit real values**. Production runs on [Railway](https://railway.app) with values injected as environment variables.

Frontend configuration works the same way: `Agapay/.env` and `agapay-admin/.env` hold public, non-secret values (API URL, Supabase URL/publishable key), and `Agapay/app.config.js` prefers a gitignored `app.development.local.json` overlay when present.

## Deployment

- **API**: Docker container on Railway (`Dockerfile` at repo root), port 8080; `MigrateOnStartup` applies EF migrations on boot.
- **Database & storage**: Supabase (Postgres + object storage for licenses and profile photos).
- **Mobile app**: Expo / EAS (`Agapay/app.development.json` holds the EAS project id and public Mapbox token).

## Security notes

- All tracked config files contain **placeholders only**. Real credentials live exclusively in gitignored local files (`appsettings.Local.json`, `app.development.local.json`) or in the host's environment variables.
- Demo OTP backdoors for `@demo.agapay.com` accounts (fixed OTP, 2FA bypass) are **config-gated** (`Seed:BypassOtpForDemoAccounts`, `Otp:DemoFixedCodeEnabled`, `Auth:DemoEmailBypassEnabled`) and can be disabled in production configuration without a code change.
- The seeded demo passwords are published here intentionally for evaluation; they apply only to `@demo.agapay.com` demo accounts.

## Documentation

- [`AGENTS.md`](AGENTS.md) — monorepo-wide instructions for AI coding agents
- [`agapay-backend/AGENTS.md`](agapay-backend/AGENTS.md) — backend architecture & contracts (error shapes, JWT/hub map, JSON casing)
- [`Agapay/AGENTS.md`](Agapay/AGENTS.md), [`agapay-admin/AGENTS.md`](agapay-admin/AGENTS.md) — frontend conventions
- [`agapay-backend/SEED_DATA_PLAN.md`](agapay-backend/SEED_DATA_PLAN.md) — demo data seeding
