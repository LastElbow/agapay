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

import { HubConnectionBuilder, HttpTransportType } from "@microsoft/signalr";

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

function buildProposalChatContent(proposal) {
  const caseTitle = proposal.caseTitle || "Therapy Session";
  const day = proposal.day || "TBD";
  const timeRange = proposal.timeRange || "TBD";
  const total = proposal.total || "₱0.00";

  const userFriendlyMessage =
    `📅 New Session Proposal\n\n` +
    `🩺 ${caseTitle}\n` +
    `📆 ${day}\n` +
    `⏰ ${timeRange}\n` +
    `💰 Total: ${total}\n\n` +
    `Please review and respond to this proposal.`;

  return `[SESSION_PROPOSAL] ${JSON.stringify(proposal)}\n${userFriendlyMessage}`;
}

async function sendChatMessage({ base, accessToken, receiverUserId, content }) {
  const hubBase = base.replace(/\/?api$/i, "");
  const connection = new HubConnectionBuilder()
    .withUrl(`${hubBase}/hubs/chat`, {
      accessTokenFactory: () => accessToken,
      transport: HttpTransportType.WebSockets,
      skipNegotiation: true,
    })
    .withAutomaticReconnect()
    .build();

  await connection.start();
  try {
    await connection.invoke("SendMessage", {
      receiverId: receiverUserId,
      content,
      messageType: "TEXT",
    });
  } finally {
    try {
      await connection.stop();
    } catch {}
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
  if (!res.ok)
    throw new Error(
      `GET /api/therapist/me/details failed ${res.status}: ${res.text}`,
    );
  return res.data?.therapistId;
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

async function updateBlueprint({ base, therapistToken, contractId }) {
  const body = {
    CaseToTreat: "E2E Case",
    SessionDays: "Monday",
    SessionStartTime: "10:00:00",
    SessionEndTime: "11:00:00",
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
  if (!res.ok)
    throw new Error(
      `PUT /api/contracts/${contractId}/blueprint failed ${res.status}: ${text}`,
    );
}

async function sendForConfirmation({ base, therapistToken, contractId }) {
  const res = await postJson(
    base,
    `/api/contracts/${contractId}/send-for-confirmation`,
    {},
    asAuth(therapistToken),
  );
  if (!res.ok)
    throw new Error(
      `POST /api/contracts/${contractId}/send-for-confirmation failed ${res.status}: ${res.text}`,
    );
}

async function getContractStatus({ base, accessToken, contractId }) {
  const res = await getJson(
    base,
    `/api/contracts/${contractId}`,
    asAuth(accessToken),
  );
  if (!res.ok)
    throw new Error(
      `GET /api/contracts/${contractId} failed ${res.status}: ${res.text}`,
    );
  return String(res.data?.status ?? "").toLowerCase();
}

async function confirmContract({ base, patientToken, contractId }) {
  const res = await postJson(
    base,
    `/api/contracts/${contractId}/confirm`,
    {},
    asAuth(patientToken),
  );
  return res;
}

async function declineContract({ base, patientToken, contractId }) {
  const res = await postJson(
    base,
    `/api/contracts/${contractId}/decline`,
    {},
    asAuth(patientToken),
  );
  return res;
}

async function fetchChatHistory({ base, accessToken, otherUserId }) {
  const res = await getJson(
    base,
    `/api/chat/history/${otherUserId}?limit=30`,
    asAuth(accessToken),
  );
  if (!res.ok)
    throw new Error(
      `GET /api/chat/history/${otherUserId} failed ${res.status}: ${res.text}`,
    );
  return res.data;
}

async function fetchUpcomingSessions({ base, accessToken }) {
  const res = await getJson(
    base,
    `/api/sessions/me/upcoming?take=25`,
    asAuth(accessToken),
  );
  if (!res.ok)
    throw new Error(
      `GET /api/sessions/me/upcoming failed ${res.status}: ${res.text}`,
    );
  return Array.isArray(res.data) ? res.data : [];
}

(async function main() {
  const base = baseUrl();
  console.log("Session proposal via chat E2E smoke");
  console.log("  baseUrl:", base);

  const therapistAuth = await registerAndVerifyOtp({
    baseUrl: base,
    role: "PhysicalTherapist",
  });
  const patientAuth = await registerAndVerifyOtp({
    baseUrl: base,
    role: "Patient",
  });

  const therapistUserId = therapistAuth.user?.id;
  const patientUserId = patientAuth.user?.id;

  assert(therapistUserId, "Therapist auth did not return user.id");
  assert(patientUserId, "Patient auth did not return user.id");

  console.log("Therapist userId:", therapistUserId);
  console.log("Patient userId:", patientUserId);

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

  console.log("Resolved ids:", { patientId, therapistId });

  const contractId = await createContract({
    base,
    therapistToken: therapistAuth.accessToken,
    patientId,
    therapistId,
  });
  console.log("Created contract:", contractId);

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

  const statusAfterSend = await getContractStatus({
    base,
    accessToken: therapistAuth.accessToken,
    contractId,
  });
  console.log("Contract status after send-for-confirmation:", statusAfterSend);
  assert(
    statusAfterSend === "pendingconfirmation" || statusAfterSend === "pending",
    "Contract not in pending confirmation status",
  );

  // Therapist sends the proposal message through chat
  const proposal = {
    contractId,
    caseTitle: "E2E Case",
    day: "Monday",
    timeRange: "10:00 AM - 11:00 AM",
    total: "₱1500.00",
  };
  const content = buildProposalChatContent(proposal);

  await sendChatMessage({
    base,
    accessToken: therapistAuth.accessToken,
    receiverUserId: patientUserId,
    content,
  });

  // Give the server a moment to persist and map signed URLs
  await sleep(250);

  const history = await fetchChatHistory({
    base,
    accessToken: patientAuth.accessToken,
    otherUserId: therapistUserId,
  });
  const messages = Array.isArray(history?.messages) ? history.messages : [];
  const found = messages.find(
    (m) =>
      typeof m?.content === "string" &&
      m.content.includes("[SESSION_PROPOSAL]"),
  );
  assert(
    found,
    "Patient chat history did not include the session proposal message",
  );
  console.log("Found proposal message in chat history:", found.id);

  // Decline first
  const declineRes = await declineContract({
    base,
    patientToken: patientAuth.accessToken,
    contractId,
  });
  assert(
    declineRes.ok,
    `Decline failed ${declineRes.status}: ${declineRes.text}`,
  );
  console.log("Decline OK");

  const statusAfterDecline = await getContractStatus({
    base,
    accessToken: therapistAuth.accessToken,
    contractId,
  });
  console.log("Contract status after decline:", statusAfterDecline);
  assert(
    statusAfterDecline === "draft",
    "Declined contract did not return to Draft",
  );

  const upcomingAfterDecline = await fetchUpcomingSessions({
    base,
    accessToken: patientAuth.accessToken,
  });
  const hasDeclinedContractSessions = upcomingAfterDecline.some(
    (s) => String(s?.contractId) === String(contractId),
  );
  assert(
    !hasDeclinedContractSessions,
    "Unexpected sessions created for declined contract",
  );

  // Re-send for confirmation, then confirm
  await sendForConfirmation({
    base,
    therapistToken: therapistAuth.accessToken,
    contractId,
  });

  const confirmRes = await confirmContract({
    base,
    patientToken: patientAuth.accessToken,
    contractId,
  });
  assert(
    confirmRes.ok,
    `Confirm failed ${confirmRes.status}: ${confirmRes.text}`,
  );
  console.log("Confirm OK:", confirmRes.data);

  const statusAfterConfirm = await getContractStatus({
    base,
    accessToken: therapistAuth.accessToken,
    contractId,
  });
  console.log("Contract status after confirm:", statusAfterConfirm);
  assert(
    statusAfterConfirm === "active",
    "Confirmed contract did not become Active",
  );

  // Sessions should now exist for both roles
  const patientUpcoming = await fetchUpcomingSessions({
    base,
    accessToken: patientAuth.accessToken,
  });
  const therapistUpcoming = await fetchUpcomingSessions({
    base,
    accessToken: therapistAuth.accessToken,
  });

  const patientHas = patientUpcoming.some(
    (s) => String(s?.contractId) === String(contractId),
  );
  const therapistHas = therapistUpcoming.some(
    (s) => String(s?.contractId) === String(contractId),
  );

  assert(
    patientHas,
    "Patient upcoming sessions missing the confirmed contract session(s)",
  );
  assert(
    therapistHas,
    "Therapist upcoming sessions missing the confirmed contract session(s)",
  );

  // Confirm again should fail with "not awaiting confirmation"
  const confirmAgain = await confirmContract({
    base,
    patientToken: patientAuth.accessToken,
    contractId,
  });
  assert(!confirmAgain.ok, "Expected confirm-again to fail but it succeeded");
  console.log(
    "Confirm-again expected failure:",
    confirmAgain.status,
    confirmAgain.data?.message ?? confirmAgain.text,
  );

  console.log("Session proposal via chat E2E: PASS");
})().catch((err) => {
  console.error("Session proposal via chat E2E: FAIL");
  console.error(err);
  process.exitCode = 1;
});
