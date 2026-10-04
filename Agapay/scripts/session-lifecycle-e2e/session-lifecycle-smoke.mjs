import {
  env,
  normalizeBaseUrl,
  getJson,
  postJson,
  postForm,
  sleep,
  tinyPngBlob,
  fetchJson,
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
    CaseToTreat: "E2E Session Lifecycle",
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

async function fetchSessionLogs({ base, accessToken, sessionId }) {
  const res = await getJson(
    base,
    `/api/sessions/${sessionId}/logs`,
    asAuth(accessToken),
  );
  if (!res.ok) {
    throw new Error(
      `GET /api/sessions/${sessionId}/logs failed ${res.status}: ${res.text}`,
    );
  }
  return Array.isArray(res.data) ? res.data : [];
}

async function startSession({ base, accessToken, sessionId }) {
  return fetchJson(`${base}/api/contracts/sessions/${sessionId}/start`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({}),
  });
}

async function completeSession({ base, accessToken, sessionId }) {
  return fetchJson(`${base}/api/contracts/sessions/${sessionId}/complete`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({}),
  });
}

async function markAsDone({ base, accessToken, sessionId }) {
  return fetchJson(`${base}/api/sessions/${sessionId}/mark-as-done`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({}),
  });
}

async function logToday({ base, accessToken, sessionId, startIso, endIso }) {
  return fetchJson(`${base}/api/sessions/${sessionId}/log-today`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ startTime: startIso, endTime: endIso }),
  });
}

(async function main() {
  const base = baseUrl();
  console.log("Session lifecycle E2E smoke");
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

  // Give the server a moment to generate sessions
  await sleep(250);

  const patientUpcoming = await fetchUpcomingSessions({
    base,
    accessToken: patientAuth.accessToken,
  });
  const therapistUpcoming = await fetchUpcomingSessions({
    base,
    accessToken: therapistAuth.accessToken,
  });

  const pickForContract = (list) =>
    list.find((s) => String(s?.contractId) === String(contractId)) ?? null;

  const session =
    pickForContract(patientUpcoming) ?? pickForContract(therapistUpcoming);
  assert(session?.id, "No upcoming session found for the confirmed contract");

  const sessionId = session.id;
  console.log("Using sessionId:", sessionId);

  // Role guard: patient cannot start
  const patientStart = await startSession({
    base,
    accessToken: patientAuth.accessToken,
    sessionId,
  });
  assert(
    patientStart.status === 403 || patientStart.status === 401,
    `Expected patient start to be forbidden, got ${patientStart.status}`,
  );

  // Therapist starts
  const startRes = await startSession({
    base,
    accessToken: therapistAuth.accessToken,
    sessionId,
  });
  assert(
    startRes.ok,
    `Therapist start failed ${startRes.status}: ${startRes.text}`,
  );

  const detailAfterStart = await fetchSessionDetail({
    base,
    accessToken: therapistAuth.accessToken,
    sessionId,
  });
  const statusAfterStart = String(detailAfterStart?.status ?? "").toLowerCase();
  assert(
    statusAfterStart === "inprogress",
    `Expected InProgress, got ${detailAfterStart?.status}`,
  );

  // Log today (therapist-only)
  const now = new Date();
  const startIso = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const endIso = now.toISOString();
  const logRes = await logToday({
    base,
    accessToken: therapistAuth.accessToken,
    sessionId,
    startIso,
    endIso,
  });
  assert(logRes.ok, `POST log-today failed ${logRes.status}: ${logRes.text}`);

  // Patient can read logs
  const logs = await fetchSessionLogs({
    base,
    accessToken: patientAuth.accessToken,
    sessionId,
  });
  assert(logs.length >= 1, "Expected at least one session log");

  // Mark as done for today
  const doneRes = await markAsDone({
    base,
    accessToken: therapistAuth.accessToken,
    sessionId,
  });
  assert(doneRes.ok, `Mark-as-done failed ${doneRes.status}: ${doneRes.text}`);

  const detailAfterDone = await fetchSessionDetail({
    base,
    accessToken: therapistAuth.accessToken,
    sessionId,
  });
  const statusAfterDone = String(detailAfterDone?.status ?? "").toLowerCase();
  assert(
    statusAfterDone === "donefortoday",
    `Expected DoneForToday, got ${detailAfterDone?.status}`,
  );

  // Complete session (therapist-only)
  const patientComplete = await completeSession({
    base,
    accessToken: patientAuth.accessToken,
    sessionId,
  });
  assert(
    patientComplete.status === 403 || patientComplete.status === 401,
    `Expected patient complete to be forbidden, got ${patientComplete.status}`,
  );

  const completeRes = await completeSession({
    base,
    accessToken: therapistAuth.accessToken,
    sessionId,
  });
  assert(
    completeRes.ok,
    `Therapist complete failed ${completeRes.status}: ${completeRes.text}`,
  );

  const detailAfterComplete = await fetchSessionDetail({
    base,
    accessToken: therapistAuth.accessToken,
    sessionId,
  });
  const statusAfterComplete = String(
    detailAfterComplete?.status ?? "",
  ).toLowerCase();
  assert(
    statusAfterComplete === "completed",
    `Expected Completed, got ${detailAfterComplete?.status}`,
  );

  console.log("Session lifecycle E2E: PASS");
})().catch((err) => {
  console.error("Session lifecycle E2E: FAIL");
  console.error(err?.stack || err);
  process.exitCode = 1;
});
