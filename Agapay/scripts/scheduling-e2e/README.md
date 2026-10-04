# Scheduling / Sessions E2E Smoke

This folder contains a small end-to-end smoke test focused on **time/schedule behavior** around **session rescheduling**, including validating **SignalR** realtime events.

## Prerequisites

- Backend running (default: `http://localhost:5211`)
- Node 18+

## Run

From `Agapay/`:

- `npm run e2e:scheduling:reschedule`
- `npm run e2e:scheduling:create-session`
- `npm run e2e:scheduling:availability`

## Environment variables

- `AGAPAY_API_BASE_URL` (default: `http://localhost:5211`)
- `AGAPAY_PASSWORD` (default: `Test12345!`)
- `AGAPAY_OTP_CODE` (optional; demo emails default to `123456`)
- `AGAPAY_LICENSE_NUMBER` (default: `PRC-E2E-0001`)

## What it validates

- Creates patient + therapist accounts and verifies OTP (dev demo bypass supported)
- Ensures the therapist has a `PhysicalTherapist` record (license submission)
- Creates + confirms contract(s) to ensure sessions exist
- Therapist proposes a reschedule via `PUT /api/sessions/{id}/reschedule`
- Patient receives `RescheduleProposed` via SignalR (`/hubs/sessions`)
- Patient declines one session and approves another, validating:
  - `RescheduleDeclined` / `RescheduleApproved` SignalR events
  - Approved session start time updates to the proposed time

### Create session (booking)

- Creates patient + therapist accounts and verifies OTP
- Creates + confirms a contract
- Therapist creates a session via `POST /api/sessions`
- Verifies the created session is visible via `GET /api/sessions/me/upcoming` for both patient and therapist

### Therapist availability (schedule management)

- Creates patient + 2 therapist accounts and verifies OTP
- Ensures both therapists have a `PhysicalTherapist` record (license submission)
- Validates role/identity guards:
  - Patient cannot `POST /api/availability/therapist/{therapistId}` (401/403)
  - Therapist cannot update another therapist's availability (401/403)
- Therapist updates own availability and validates:
  - Weekly block creation
  - Overlap validation (400)
  - Specific-date add + delete semantics via `isAvailable: false`
- Validates `/booked` endpoint basic range validation
