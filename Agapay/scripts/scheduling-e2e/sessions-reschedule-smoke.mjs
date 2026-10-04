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

function isoAddMs(iso, deltaMs) {
  const base = new Date(iso);
  assert(Number.isFinite(base.getTime()), `Invalid ISO timestamp: ${iso}`);
  return new Date(base.getTime() + deltaMs).toISOString();
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
  if (!res.ok)
    throw new Error(
      `GET /api/therapist/me/details failed ${res.status}: ${res.text}`,
    );
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
    CaseToTreat: "E2E Case",
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

async function confirmContract({ base, patientToken, contractId }) {
  const res = await postJson(
    base,
    `/api/contracts/${contractId}/confirm`,
    {},
    asAuth(patientToken),
  );
  if (!res.ok)
    throw new Error(
      `POST /api/contracts/${contractId}/confirm failed ${res.status}: ${res.text}`,
    );
}

async function fetchUpcomingSessions({ base, accessToken }) {
  const res = await getJson(
    base,
    `/api/sessions/me/upcoming?take=50`,
    asAuth(accessToken),
  );
  if (!res.ok)
    throw new Error(
      `GET /api/sessions/me/upcoming failed ${res.status}: ${res.text}`,
    );
  return Array.isArray(res.data) ? res.data : [];
}

async function fetchSessionDetail({ base, accessToken, sessionId }) {
  const res = await getJson(
    base,
    `/api/sessions/${sessionId}`,
    asAuth(accessToken),
  );
  if (!res.ok)
    throw new Error(
      `GET /api/sessions/${sessionId} failed ${res.status}: ${res.text}`,
    );
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

async function connectSessionsHub({ base, accessToken }) {
  const hubBase = base.replace(/\/?api$/i, "");
  const connection = new HubConnectionBuilder()
    .withUrl(`${hubBase}/hubs/sessions`, {
      accessTokenFactory: () => accessToken,
      transport: HttpTransportType.WebSockets,
      skipNegotiation: true,
    })
    .withAutomaticReconnect()
    .build();

  await connection.start();
  return connection;
}

function waitForEvent({ connection, eventName, predicate, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);

    const handler = (payload) => {
      try {
        if (!predicate || predicate(payload)) {
          cleanup();
          resolve(payload);
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    function cleanup() {
      clearTimeout(timer);
      try {
        connection.off(eventName, handler);
      } catch {}
    }

    connection.on(eventName, handler);
  });
}

async function proposeReschedule({
  base,
  therapistToken,
  sessionId,
  newStartAtIso,
  newEndAtIso,
}) {
  // Backend semantics: a *proposal* is created by therapist calling /cancel with proposed reschedule times.
  // This transitions the session to PendingRescheduleApproval and emits SignalR event `RescheduleProposed`.
  const url = `${base}/api/sessions/${sessionId}/cancel`;
  const res = await fetchJson(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${therapistToken}`,
    },
    body: JSON.stringify({
      reason: "reschedule_proposal",
      proposedRescheduleStartAt: newStartAtIso,
      proposedRescheduleEndAt: newEndAtIso,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `PUT /api/sessions/${sessionId}/cancel failed ${res.status}: ${res.text}`,
    );
  }

  return res.data;
}

async function approveReschedule({ base, patientToken, sessionId }) {
  const res = await fetchJson(
    `${base}/api/sessions/${sessionId}/approve-reschedule`,
    {
      method: "PUT",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${patientToken}`,
      },
      body: JSON.stringify({}),
    },
  );

  if (!res.ok) {
    throw new Error(
      `PUT /api/sessions/${sessionId}/approve-reschedule failed ${res.status}: ${res.text}`,
    );
  }

  return res.data;
}

async function declineReschedule({ base, patientToken, sessionId }) {
  const res = await fetchJson(
    `${base}/api/sessions/${sessionId}/decline-reschedule`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${patientToken}`,
      },
      body: JSON.stringify({ reason: "schedule_conflict" }),
    },
  );

  if (!res.ok) {
    throw new Error(
      `PUT /api/sessions/${sessionId}/decline-reschedule failed ${res.status}: ${res.text}`,
    );
  }

  return res.data;
}

async function buildConfirmedContractWithSessions({
  base,
  therapistToken,
  patientToken,
  patientId,
  therapistId,
}) {
  const contractId = await createContract({
    base,
    therapistToken,
    patientId,
    therapistId,
  });
  await updateBlueprint({ base, therapistToken, contractId });
  await sendForConfirmation({ base, therapistToken, contractId });
  await confirmContract({ base, patientToken, contractId });

  // Give the server a moment to generate sessions
  await sleep(250);

  return contractId;
}

(async function main() {
  const base = baseUrl();
  console.log("Sessions reschedule E2E smoke");
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

  // Connect patient to sessions hub to validate realtime notifications.
  const patientConn = await connectSessionsHub({
    base,
    accessToken: patientAuth.accessToken,
  });

  try {
    // Ensure we have at least three sessions:
    // 1) decline branch
    // 2) approve-success branch
    // 3) approve-fail-on-conflict (race) branch
    let sessions = [];
    let attempts = 0;
    while (sessions.length < 3 && attempts < 3) {
      attempts += 1;
      const contractId = await buildConfirmedContractWithSessions({
        base,
        therapistToken: therapistAuth.accessToken,
        patientToken: patientAuth.accessToken,
        patientId,
        therapistId,
      });

      const upcoming = await fetchUpcomingSessions({
        base,
        accessToken: patientAuth.accessToken,
      });
      const fromContract = upcoming.filter(
        (s) => String(s?.contractId) === String(contractId),
      );
      sessions = sessions.concat(fromContract);
    }

    assert(
      sessions.length >= 3,
      `Expected at least 3 upcoming sessions, got ${sessions.length}`,
    );

    const [declineTarget, approveTarget, raceTarget] = sessions;

    // --- Decline branch ---
    {
      const detail = await fetchSessionDetail({
        base,
        accessToken: therapistAuth.accessToken,
        sessionId: declineTarget.id,
      });
      const startAt = detail?.startAt;
      const endAt = detail?.endAt;
      assert(
        typeof startAt === "string" && typeof endAt === "string",
        "Session detail missing startAt/endAt",
      );

      const durationMs =
        new Date(endAt).getTime() - new Date(startAt).getTime();
      assert(
        Number.isFinite(durationMs) && durationMs > 0,
        "Invalid session duration",
      );

      const newStartAtIso = isoAddMs(
        startAt,
        24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000,
      ); // +1 day +2h
      const newEndAtIso = isoAddMs(newStartAtIso, durationMs);

      const waitProposed = waitForEvent({
        connection: patientConn,
        eventName: "RescheduleProposed",
        predicate: (p) => String(p?.sessionId) === String(declineTarget.id),
        timeoutMs: 8000,
      });

      const proposeRes = await proposeReschedule({
        base,
        therapistToken: therapistAuth.accessToken,
        sessionId: declineTarget.id,
        newStartAtIso,
        newEndAtIso,
      });

      console.log("Reschedule proposed (decline branch):", proposeRes);

      await waitProposed;

      const waitDeclined = waitForEvent({
        connection: patientConn,
        eventName: "RescheduleDeclined",
        predicate: (p) => String(p?.sessionId) === String(declineTarget.id),
        timeoutMs: 8000,
      });

      await declineReschedule({
        base,
        patientToken: patientAuth.accessToken,
        sessionId: declineTarget.id,
      });
      await waitDeclined;

      const after = await fetchSessionDetail({
        base,
        accessToken: patientAuth.accessToken,
        sessionId: declineTarget.id,
      });
      assert(
        after?.status === "Scheduled",
        `Expected status Scheduled after decline, got ${after?.status}`,
      );
      // Proposal-only decline should keep original schedule intact.
      const originalMs = new Date(startAt).getTime();
      const afterMs = new Date(after?.startAt).getTime();
      assert(
        Number.isFinite(afterMs) && Math.abs(afterMs - originalMs) < 1000,
        `Expected startAt unchanged ~${startAt} but got ${after?.startAt}`,
      );
      console.log("After decline status:", after?.status);
    }

    // --- Approve branch ---
    {
      const detail = await fetchSessionDetail({
        base,
        accessToken: therapistAuth.accessToken,
        sessionId: approveTarget.id,
      });
      const startAt = detail?.startAt;
      const endAt = detail?.endAt;
      assert(
        typeof startAt === "string" && typeof endAt === "string",
        "Session detail missing startAt/endAt",
      );

      const durationMs =
        new Date(endAt).getTime() - new Date(startAt).getTime();
      assert(
        Number.isFinite(durationMs) && durationMs > 0,
        "Invalid session duration",
      );

      const newStartAtIso = isoAddMs(
        startAt,
        48 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000,
      ); // +2 days +3h
      const newEndAtIso = isoAddMs(newStartAtIso, durationMs);

      const waitProposed = waitForEvent({
        connection: patientConn,
        eventName: "RescheduleProposed",
        predicate: (p) => String(p?.sessionId) === String(approveTarget.id),
        timeoutMs: 8000,
      });

      const proposeRes = await proposeReschedule({
        base,
        therapistToken: therapistAuth.accessToken,
        sessionId: approveTarget.id,
        newStartAtIso,
        newEndAtIso,
      });

      console.log("Reschedule proposed (approve branch):", proposeRes);

      await waitProposed;

      const waitApproved = waitForEvent({
        connection: patientConn,
        eventName: "RescheduleApproved",
        predicate: (p) => String(p?.sessionId) === String(approveTarget.id),
        timeoutMs: 8000,
      });

      await approveReschedule({
        base,
        patientToken: patientAuth.accessToken,
        sessionId: approveTarget.id,
      });
      await waitApproved;

      const after = await fetchSessionDetail({
        base,
        accessToken: patientAuth.accessToken,
        sessionId: approveTarget.id,
      });

      // Backend might normalize ISO formatting; compare by ms.
      const expectedMs = new Date(newStartAtIso).getTime();
      const actualMs = new Date(after?.startAt).getTime();
      assert(
        Number.isFinite(actualMs) && Math.abs(actualMs - expectedMs) < 1000,
        `Expected startAt ~${newStartAtIso} but got ${after?.startAt}`,
      );

      console.log("After approve startAt:", after?.startAt);
    }

    // --- Approve conflict (race) branch ---
    {
      const detail = await fetchSessionDetail({
        base,
        accessToken: therapistAuth.accessToken,
        sessionId: raceTarget.id,
      });
      const originalStartAt = detail?.startAt;
      const originalEndAt = detail?.endAt;
      assert(
        typeof originalStartAt === "string" && typeof originalEndAt === "string",
        "Session detail missing startAt/endAt",
      );

      const durationMs =
        new Date(originalEndAt).getTime() - new Date(originalStartAt).getTime();
      assert(
        Number.isFinite(durationMs) && durationMs > 0,
        "Invalid session duration",
      );

      // Pick a new slot far enough away to reduce accidental conflicts with generated sessions.
      const proposedStartAtIso = isoAddMs(
        originalStartAt,
        7 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000,
      ); // +7 days +5h
      const proposedEndAtIso = isoAddMs(proposedStartAtIso, durationMs);

      const waitProposed = waitForEvent({
        connection: patientConn,
        eventName: "RescheduleProposed",
        predicate: (p) => String(p?.sessionId) === String(raceTarget.id),
        timeoutMs: 8000,
      });

      await proposeReschedule({
        base,
        therapistToken: therapistAuth.accessToken,
        sessionId: raceTarget.id,
        newStartAtIso: proposedStartAtIso,
        newEndAtIso: proposedEndAtIso,
      });
      await waitProposed;

      // Occupy the proposed slot after the proposal but before approval.
      const conflictSessionBody = {
        TherapistId: therapistId,
        ContractId: raceTarget.contractId,
        StartAt: proposedStartAtIso,
        EndAt: proposedEndAtIso,
        LocationAddress: "E2E Conflict Slot",
        Latitude: 14.5995,
        Longitude: 120.9842,
      };
      const conflictSessionId = await createSession({
        base,
        therapistToken: therapistAuth.accessToken,
        body: conflictSessionBody,
      });
      console.log("Created conflictSessionId:", conflictSessionId);

      // Approving should now fail.
      const approveRace = await fetchJson(
        `${base}/api/sessions/${raceTarget.id}/approve-reschedule`,
        {
          method: "PUT",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${patientAuth.accessToken}`,
          },
          body: JSON.stringify({}),
        },
      );

      assert(
        !approveRace.ok && approveRace.status === 400,
        `Expected approve-reschedule to fail with 400 due to conflict, got ${approveRace.status}: ${approveRace.text}`,
      );

      const after = await fetchSessionDetail({
        base,
        accessToken: patientAuth.accessToken,
        sessionId: raceTarget.id,
      });

      assert(
        after?.status === "PendingRescheduleApproval",
        `Expected status PendingRescheduleApproval after failed approval, got ${after?.status}`,
      );

      const originalMs = new Date(originalStartAt).getTime();
      const afterMs = new Date(after?.startAt).getTime();
      assert(
        Number.isFinite(afterMs) && Math.abs(afterMs - originalMs) < 1000,
        `Expected startAt unchanged ~${originalStartAt} but got ${after?.startAt}`,
      );
    }

    console.log("Sessions reschedule E2E: PASS");
  } finally {
    try {
      await patientConn.stop();
    } catch {}
  }
})().catch((err) => {
  console.error("Sessions reschedule E2E: FAIL");
  console.error(err);
  process.exitCode = 1;
});
