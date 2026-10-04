# Chat beyond proposals E2E smoke

Runs a minimal end-to-end chat smoke test that validates **non-proposal** chat behaviors:

- realtime `ReceiveMessage` for a normal `TEXT` message (sender + receiver)
- realtime + persisted `IMAGE` message (uses a dummy `imagePath`, no upload)
- persistence via `GET /api/chat/history/{otherUserId}`
- unread counts via `GET /api/chat/conversations`
- read receipts via `POST /api/chat/history/{otherUserId}/read`
- close/reopen behavior (`MessageRejected: conversation_closed`)
- block/unblock behavior (`MessageRejected: blocked_by_other`)

## Prereqs

- Backend running (defaults to `http://localhost:5211`)
- Node 18+

## Run

```bash
npm run e2e:chat:smoke
```

## Environment variables (optional)

- `AGAPAY_API_BASE_URL` (default: `http://localhost:5211`)
- `AGAPAY_PASSWORD` (default: `Test12345!`)
- `AGAPAY_OTP_CODE` (default for `@demo.agapay.com` emails: `123456`)

Notes:

- The script registers fresh demo users each run (random `@demo.agapay.com` emails) unless you override `AGAPAY_EMAIL`.
