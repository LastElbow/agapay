import {
  env,
  normalizeBaseUrl,
  getJson,
  postJson,
  postForm,
  sleep,
  tinyPngBlob,
} from "../onboarding-e2e/lib.mjs";
import { registerAndVerifyOtp } from "../onboarding-e2e/auth.mjs";

function baseUrl() {
  return normalizeBaseUrl(env("AGAPAY_API_BASE_URL", "http://localhost:5211"));
}

function asAuth(accessToken) {
  return { accessToken };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isoNowPlusDays(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function isoUtcAt({
  daysFromNow,
  hour = 10,
  minute = 0,
  durationMinutes = 60,
}) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + daysFromNow);
  start.setUTCHours(hour, minute, 0, 0);

  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

async function ensureTherapistRecord({ base, therapistToken }) {
  // Therapist record is created on first license submission.
  const form = new FormData();
  form.append("licenseNumber", env("AGAPAY_LICENSE_NUMBER", "PRC-E2E-0001"));
  form.append("gender", "Male");
  form.append("licenseImage", tinyPngBlob(), "license.png");

  const res = await postForm(
    base,
    "/api/Onboarding/therapist/submit-license",
    form,
    asAuth(therapistToken),
  );

  // 200 OK is expected for first submission; 409 can happen if already pending.
  if (!res.ok && res.status !== 409) {
    throw new Error(
      `POST /api/Onboarding/therapist/submit-license failed ${res.status}: ${res.text}`,
    );
  }
}

async function getPatientId({ base, patientToken }) {
  const me = await getJson(base, "/api/patient/me", asAuth(patientToken));
  if (!me.ok)
    throw new Error(`GET /api/patient/me failed ${me.status}: ${me.text}`);
  return me.data?.id;
}

async function getTherapistId({ base, therapistToken }) {
  const res = await getJson(
    base,
    "/api/therapist/me/details",
    asAuth(therapistToken),
  );
  if (!res.ok) {
    throw new Error(
      `GET /api/therapist/me/details failed ${res.status}: ${res.text}`,
    );
  }
  return res.data?.therapistId;
}

async function createContract({
  base,
  therapistToken,
  patientId,
  therapistId,
}) {
  const body = {
    PatientId: patientId,
    PhysicalTherapistId: therapistId,
    StartDate: isoNowPlusDays(1),
    EndDate: isoNowPlusDays(30),
  };

  const res = await postJson(
    base,
    "/api/contracts",
    body,
    asAuth(therapistToken),
  );
  if (!res.ok)
    throw new Error(`POST /api/contracts failed ${res.status}: ${res.text}`);

  const id = res.data?.id ?? res.data?.Id;
  assert(id, "Create contract succeeded but no id returned.");
  return id;
}

async function updateBlueprint({
  base,
  therapistToken,
  contractId,
  startTime = "10:00:00",
  endTime = "11:00:00",
}) {
  const body = {
    CaseToTreat: "E2E Create Session",
    SessionDays: "Monday",
    SessionStartTime: startTime,
    SessionEndTime: endTime,
    ProfessionalFee: 1200,
    LocationFee: 200,
    MiscellaneousFee: 100,
    TotalFee: 1500,
    ProposedSessionDate: isoNowPlusDays(3),
  };

  const res = await fetch(`${base}/api/contracts/${contractId}/blueprint`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${therapistToken}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `PUT /api/contracts/${contractId}/blueprint failed ${res.status}: ${text}`,
    );
  }
}

async function sendForConfirmation({ base, therapistToken, contractId }) {
  const res = await postJson(
    base,
    `/api/contracts/${contractId}/send-for-confirmation`,
    {},
    asAuth(therapistToken),
  );
  if (!res.ok) {
    throw new Error(
      `POST /api/contracts/${contractId}/send-for-confirmation failed ${res.status}: ${res.text}`,
    );
  }
}

async function confirmContract({ base, patientToken, contractId }) {
  const res = await postJson(
    base,
    `/api/contracts/${contractId}/confirm`,
    {},
    asAuth(patientToken),
  );
  if (!res.ok) {
    throw new Error(
      `POST /api/contracts/${contractId}/confirm failed ${res.status}: ${res.text}`,
    );
  }
}

async function fetchUpcomingSessions({ base, accessToken }) {
  const res = await getJson(
    base,
    `/api/sessions/me/upcoming?take=50`,
    asAuth(accessToken),
  );
  if (!res.ok) {
    throw new Error(
      `GET /api/sessions/me/upcoming failed ${res.status}: ${res.text}`,
    );
  }
  return Array.isArray(res.data) ? res.data : [];
}

async function fetchSessionDetail({ base, accessToken, sessionId }) {
  const res = await getJson(
    base,
    `/api/sessions/${sessionId}`,
    asAuth(accessToken),
  );
  if (!res.ok) {
    throw new Error(
      `GET /api/sessions/${sessionId} failed ${res.status}: ${res.text}`,
    );
  }
  return res.data;
}

async function createSession({ base, therapistToken, body }) {
  const res = await postJson(
    base,
    "/api/sessions",
    body,
    asAuth(therapistToken),
  );
  if (!res.ok) {
    throw new Error(`POST /api/sessions failed ${res.status}: ${res.text}`);
  }
  const id = res.data?.id ?? res.data?.Id;
  assert(id, "Create session succeeded but no id returned.");
  return id;
}

(async function main() {
  const base = baseUrl();
  console.log("Create session (booking) E2E smoke");
  console.log("  baseUrl:", base);

  const therapistAuth = await registerAndVerifyOtp({
    baseUrl: base,
    role: "PhysicalTherapist",
  });
  const patientAuth = await registerAndVerifyOtp({
    baseUrl: base,
    role: "Patient",
  });

  const patientId = await getPatientId({
    base,
    patientToken: patientAuth.accessToken,
  });
  await ensureTherapistRecord({
    base,
    therapistToken: therapistAuth.accessToken,
  });
  const therapistId = await getTherapistId({
    base,
    therapistToken: therapistAuth.accessToken,
  });

  assert(patientId, "Failed to resolve patientId");
  assert(therapistId, "Failed to resolve therapistId");

  const contractId = await createContract({
    base,
    therapistToken: therapistAuth.accessToken,
    patientId,
    therapistId,
  });

  // Match the expected app flow: confirm a contract, then allow booking.
  await updateBlueprint({
    base,
    therapistToken: therapistAuth.accessToken,
    contractId,
  });
  await sendForConfirmation({
    base,
    therapistToken: therapistAuth.accessToken,
    contractId,
  });
  await confirmContract({
    base,
    patientToken: patientAuth.accessToken,
    contractId,
  });

  // Give the server a moment for any post-confirm side effects (e.g., auto-generation).
  await sleep(250);

  const { startIso, endIso } = isoUtcAt({
    daysFromNow: 5,
    hour: 9,
    minute: 0,
    durationMinutes: 60,
  });
  const body = {
    TherapistId: therapistId,
    ContractId: contractId,
    StartAt: startIso,
    EndAt: endIso,
    LocationAddress: "E2E Booking Location",
    Latitude: 14.5995,
    Longitude: 120.9842,
  };

  // Role guard: patient cannot create a session.
  const patientCreate = await postJson(
    base,
    "/api/sessions",
    body,
    asAuth(patientAuth.accessToken),
  );
  assert(
    !patientCreate.ok &&
      (patientCreate.status === 401 || patientCreate.status === 403),
    `Expected patient create-session to fail with 401/403, got ${patientCreate.status}`,
  );

  const sessionId = await createSession({
    base,
    therapistToken: therapistAuth.accessToken,
    body,
  });
  console.log("Created sessionId:", sessionId);

  // Regression: backend must reject overlapping sessions for the same therapist.
  const overlapAttempt = await postJson(
    base,
    "/api/sessions",
    body,
    asAuth(therapistAuth.accessToken),
  );
  assert(
    !overlapAttempt.ok && overlapAttempt.status === 400,
    `Expected overlapping create-session to fail with 400, got ${overlapAttempt.status} (${overlapAttempt.text})`,
  );

  const therapistDetail = await fetchSessionDetail({
    base,
    accessToken: therapistAuth.accessToken,
    sessionId,
  });
  assert(
    String(therapistDetail?.contractId) === String(contractId),
    "Therapist detail contractId mismatch",
  );

  const patientDetail = await fetchSessionDetail({
    base,
    accessToken: patientAuth.accessToken,
    sessionId,
  });
  assert(
    String(patientDetail?.contractId) === String(contractId),
    "Patient detail contractId mismatch",
  );

  // Verify in upcoming lists for both participants.
  const patientUpcoming = await fetchUpcomingSessions({
    base,
    accessToken: patientAuth.accessToken,
  });
  const therapistUpcoming = await fetchUpcomingSessions({
    base,
    accessToken: therapistAuth.accessToken,
  });

  const inPatientUpcoming = patientUpcoming.some(
    (s) => String(s?.id) === String(sessionId),
  );
  const inTherapistUpcoming = therapistUpcoming.some(
    (s) => String(s?.id) === String(sessionId),
  );

  assert(
    inPatientUpcoming,
    "Created session not found in patient upcoming sessions",
  );
  assert(
    inTherapistUpcoming,
    "Created session not found in therapist upcoming sessions",
  );

  console.log("OK: booking/create-session smoke passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
