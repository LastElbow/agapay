# Auth E2E Smoke Scripts

Small Node scripts to exercise the backend Auth API end-to-end (register → OTP verify → login → refresh) using the same endpoints the app uses.

## Prereqs

- Node 18+ (uses global `fetch`).
- Backend running locally (default assumes `http://localhost:5211`).

Backend default ports are defined in `agapay-backend/agapay-backend/Properties/launchSettings.json`.

## Run

From the `Agapay/` folder:

```bash
node scripts/auth-e2e/auth-smoke.mjs
```

By default it:

- Uses `AGAPAY_ROLE=Patient`
- Generates a new `@demo.agapay.com` email each run
- Uses `123456` as the OTP code for demo accounts (works in Development when demo-bypass is enabled)

### Common env vars

- `AGAPAY_API_BASE_URL` (default: `http://localhost:5211`)
- `AGAPAY_ROLE` (`Patient` | `PhysicalTherapist`)
- `AGAPAY_EMAIL` / `AGAPAY_PASSWORD`
- `AGAPAY_OTP_CODE` (if you want non-interactive OTP for non-demo emails)
- `AGAPAY_DEVICE_ID` / `AGAPAY_DEVICE_NAME`

Example (therapist):

```bash
set AGAPAY_ROLE=PhysicalTherapist
node scripts/auth-e2e/auth-smoke.mjs
```

If OTP bypass is not enabled for demo accounts, the script will prompt you to paste the emailed OTP.

Note: if you override `AGAPAY_PASSWORD`, ensure it matches the backend password policy (at least 8 chars, includes a digit, and includes a non-alphanumeric character by default).
