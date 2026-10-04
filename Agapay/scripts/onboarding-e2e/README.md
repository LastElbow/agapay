# Onboarding E2E Smoke Scripts

These scripts validate frontend↔backend compatibility for onboarding flows by calling the same API endpoints the app uses.

They run at the API level (no UI automation):

- Patient onboarding: register → OTP verify → GET status/user-info → POST `/api/Onboarding/patient`
- Therapist onboarding: register → OTP verify → submit-license → admin approve → fetch reference data → POST `/api/Onboarding/therapist`

## Prereqs

- Node 18+
- Backend running locally (default `http://localhost:5211`)

## Run

From `Agapay/`:

```bash
npm run e2e:onboarding:patient
npm run e2e:onboarding:therapist
```

Or both:

```bash
npm run e2e:onboarding
```

## Env vars

- `AGAPAY_API_BASE_URL` (default `http://localhost:5211`)
- `AGAPAY_EMAIL` / `AGAPAY_PASSWORD` (optional; otherwise generates a new `@demo.agapay.com` address)
- `AGAPAY_OTP_CODE` (optional; otherwise uses `123456` for demo emails in Development)

Therapist-specific:

- `AGAPAY_LICENSE_NUMBER` (default `PRC-E2E-0001`)
- `AGAPAY_FEE_PER_SESSION` (default `1500`)

Admin (used only by therapist script):

- `AGAPAY_ADMIN_EMAIL` (default `admin@demo.agapay.com`)
- `AGAPAY_ADMIN_PASSWORD` (default `Password123!`)
