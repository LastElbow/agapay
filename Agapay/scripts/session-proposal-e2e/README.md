# Session Proposal via Chat — E2E Smoke Script

This script validates the full flow where a **Physical Therapist sends a session proposal to a Patient through chat**, and the Patient accepts/declines it, including the **sessions generation** side-effects.

It exercises the real backend API + SignalR hub:

- Create contract (Draft)
- Therapist updates blueprint + sends for confirmation
- Therapist sends `[SESSION_PROPOSAL]` chat message via `ChatHub`
- Patient sees proposal in chat history
- Patient declines → contract returns to Draft → no sessions created
- Therapist re-sends for confirmation
- Patient confirms → contract becomes Active → sessions are generated and appear in `/api/sessions/me/upcoming`

## Run

From `Agapay/`:

```bash
npm run e2e:session-proposal
```

## Env vars

- `AGAPAY_API_BASE_URL` (default `http://localhost:5211`)
- `AGAPAY_OTP_CODE` (optional; demo emails use `123456` when bypass enabled)

The script generates fresh `@demo.agapay.com` emails each run.
