# Profile E2E Smoke

Runs a minimal end-to-end smoke that:

- Registers a Patient + PhysicalTherapist
- Updates each profile via the role-specific endpoints
- Verifies updates via follow-up `GET` calls

## Prereqs

- Backend running (default `http://localhost:5211`)
- Node 18+ (global `fetch`)

## Run

```bash
npm run e2e:profile:edit
```

## Env

- `AGAPAY_API_BASE_URL` (default `http://localhost:5211`)
- `AGAPAY_LICENSE_NUMBER` (optional)
