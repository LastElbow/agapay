# Session lifecycle E2E smoke

Runs a minimal end-to-end API smoke test that drives a generated session through:

- `Scheduled` → `InProgress` (therapist starts session)
- logs a `SessionLog` entry for today (therapist-only)
- `DoneForToday` (therapist marks as done)
- `Completed` (therapist completes session)

It also asserts basic role-guards (patient cannot start/complete).

## Prereqs

- Backend running (defaults to `http://localhost:5211`)
- Node 18+

## Run

```bash
npm run e2e:sessions:lifecycle
```

## Environment variables (optional)

- `AGAPAY_API_BASE_URL` (default: `http://localhost:5211`)
- `AGAPAY_LICENSE_NUMBER` (default: `PRC-E2E-0001`)
- `AGAPAY_PASSWORD`, `AGAPAY_OTP_CODE`, etc. (see other E2E scripts)
