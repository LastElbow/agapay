import {
  env,
  normalizeBaseUrl,
  getJson,
  postJson,
  postForm,
  tinyPngBlob,
  sleep,
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

function normalizeDow(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    const last = trimmed.includes(".") ? trimmed.split(".").pop() : trimmed;
    const map = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    };
    if (last && map[last] != null) return map[last];
    const n = Number(last);
    if (Number.isFinite(n) && n >= 0 && n <= 6) return Math.trunc(n);
  }
  return NaN;
}

function ymdFromLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function findNextLocalYmdForDow(targetDow /* 0..6 */, maxDaysAhead = 21) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  for (let i = 0; i <= maxDaysAhead; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d.getDay() === targetDow) return ymdFromLocalDate(d);
  }
  throw new Error(
    `Unable to find next date for dow=${targetDow} within ${maxDaysAhead} days`,
  );
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

async function getAvailability({ base, accessToken, therapistId }) {
  const res = await getJson(
    base,
    `/api/availability/therapist/${therapistId}`,
    asAuth(accessToken),
  );
  if (!res.ok) {
    throw new Error(
      `GET /api/availability/therapist/${therapistId} failed ${res.status}: ${res.text}`,
    );
  }
  return Array.isArray(res.data) ? res.data : [];
}

async function updateAvailability({
  base,
  therapistToken,
  therapistId,
  payload,
}) {
  const res = await postJson(
    base,
    `/api/availability/therapist/${therapistId}`,
    payload,
    asAuth(therapistToken),
  );
  return res;
}

(async function main() {
  const base = baseUrl();
  console.log("Therapist schedule (availability) E2E smoke");
  console.log("  baseUrl:", base);

  const therapist1Auth = await registerAndVerifyOtp({
    baseUrl: base,
    role: "PhysicalTherapist",
  });
  const therapist2Auth = await registerAndVerifyOtp({
    baseUrl: base,
    role: "PhysicalTherapist",
  });
  const patientAuth = await registerAndVerifyOtp({
    baseUrl: base,
    role: "Patient",
  });

  await ensureTherapistRecord({
    base,
    therapistToken: therapist1Auth.accessToken,
  });
  await ensureTherapistRecord({
    base,
    therapistToken: therapist2Auth.accessToken,
  });

  const therapistId1 = await getTherapistId({
    base,
    therapistToken: therapist1Auth.accessToken,
  });
  const therapistId2 = await getTherapistId({
    base,
    therapistToken: therapist2Auth.accessToken,
  });
  assert(therapistId1, "Failed to resolve therapistId1");
  assert(therapistId2, "Failed to resolve therapistId2");

  // Anyone authenticated can read availability
  const before = await getAvailability({
    base,
    accessToken: patientAuth.accessToken,
    therapistId: therapistId1,
  });
  console.log("Initial availability count:", before.length);

  // Patient cannot update availability
  const patientUpdate = await postJson(
    base,
    `/api/availability/therapist/${therapistId1}`,
    [
      {
        dayOfWeek: 1,
        startTime: "10:00:00",
        endTime: "11:00:00",
        isAvailable: true,
      },
    ],
    asAuth(patientAuth.accessToken),
  );
  assert(
    !patientUpdate.ok &&
      (patientUpdate.status === 401 || patientUpdate.status === 403),
    `Expected patient update to fail with 401/403, got ${patientUpdate.status}`,
  );

  // Therapist cannot update another therapist's availability
  const crossUpdate = await updateAvailability({
    base,
    therapistToken: therapist1Auth.accessToken,
    therapistId: therapistId2,
    payload: [
      {
        dayOfWeek: 1,
        startTime: "10:00:00",
        endTime: "11:00:00",
        isAvailable: true,
      },
    ],
  });
  assert(
    !crossUpdate.ok &&
      (crossUpdate.status === 401 || crossUpdate.status === 403),
    `Expected cross-therapist update to fail with 401/403, got ${crossUpdate.status}`,
  );

  // Happy path: therapist updates own weekly availability
  const addWeekly = await updateAvailability({
    base,
    therapistToken: therapist1Auth.accessToken,
    therapistId: therapistId1,
    payload: [
      {
        dayOfWeek: 2, // Tuesday
        startTime: "10:00:00",
        endTime: "11:00:00",
        isAvailable: true,
      },
    ],
  });
  assert(
    addWeekly.ok,
    `Expected weekly update ok, got ${addWeekly.status}: ${addWeekly.text}`,
  );

  await sleep(150);
  const afterWeekly = await getAvailability({
    base,
    accessToken: therapist1Auth.accessToken,
    therapistId: therapistId1,
  });
  assert(
    afterWeekly.length >= 1,
    "Expected at least 1 availability block after weekly add",
  );

  // Validation: overlapping block should be rejected (400)
  const overlapAttempt = await updateAvailability({
    base,
    therapistToken: therapist1Auth.accessToken,
    therapistId: therapistId1,
    payload: [
      {
        dayOfWeek: 2, // Tuesday
        startTime: "10:30:00",
        endTime: "11:30:00",
        isAvailable: true,
      },
    ],
  });
  assert(
    !overlapAttempt.ok && overlapAttempt.status === 400,
    `Expected overlap attempt to fail with 400, got ${overlapAttempt.status}`,
  );
  assert(
    String(overlapAttempt.text || "")
      .toLowerCase()
      .includes("overlap"),
    `Expected overlap error message to mention overlap, got: ${overlapAttempt.text}`,
  );

  const afterOverlap = await getAvailability({
    base,
    accessToken: therapist1Auth.accessToken,
    therapistId: therapistId1,
  });
  assert(
    afterOverlap.length === afterWeekly.length,
    "Expected overlap rejection to not change availability",
  );

  // Specific-date: add, then delete via isAvailable:false
  const targetDow = 1; // Monday
  const ymd = findNextLocalYmdForDow(targetDow);

  const addSpecific = await updateAvailability({
    base,
    therapistToken: therapist1Auth.accessToken,
    therapistId: therapistId1,
    payload: [
      {
        dayOfWeek: targetDow,
        startTime: "14:00:00",
        endTime: "15:00:00",
        isAvailable: true,
        specificDate: ymd,
      },
    ],
  });
  assert(
    addSpecific.ok,
    `Expected specific-date add ok, got ${addSpecific.status}: ${addSpecific.text}`,
  );

  await sleep(150);
  const afterSpecific = await getAvailability({
    base,
    accessToken: therapist1Auth.accessToken,
    therapistId: therapistId1,
  });
  const specificBlocks = afterSpecific
    .filter((b) => b?.specificDate)
    .map((b) => ({
      dayOfWeek: b?.dayOfWeek,
      startTime: b?.startTime,
      endTime: b?.endTime,
      specificDate: b?.specificDate,
    }));
  if (specificBlocks.length) {
    console.log("Specific-date blocks:", specificBlocks);
  }
  const hasSpecific = afterSpecific.some((b) => {
    const dateStr = String(b?.specificDate ?? "").split("T")[0];
    return (
      dateStr === ymd &&
      normalizeDow(b?.dayOfWeek) === targetDow &&
      String(b?.startTime ?? "").startsWith("14:00") &&
      String(b?.endTime ?? "").startsWith("15:00")
    );
  });
  assert(hasSpecific, "Expected specific-date block present after add");

  const deleteSpecific = await updateAvailability({
    base,
    therapistToken: therapist1Auth.accessToken,
    therapistId: therapistId1,
    payload: [
      {
        dayOfWeek: targetDow,
        startTime: "14:00:00",
        endTime: "15:00:00",
        isAvailable: false,
        specificDate: ymd,
      },
    ],
  });
  assert(
    deleteSpecific.ok,
    `Expected specific-date delete ok, got ${deleteSpecific.status}: ${deleteSpecific.text}`,
  );

  await sleep(150);
  const afterDelete = await getAvailability({
    base,
    accessToken: therapist1Auth.accessToken,
    therapistId: therapistId1,
  });
  const stillHasSpecific = afterDelete.some((b) => {
    const dateStr = String(b?.specificDate ?? "").split("T")[0];
    return (
      dateStr === ymd &&
      normalizeDow(b?.dayOfWeek) === targetDow &&
      String(b?.startTime ?? "").startsWith("14:00") &&
      String(b?.endTime ?? "").startsWith("15:00")
    );
  });
  assert(
    !stillHasSpecific,
    "Expected specific-date block removed after delete",
  );

  // Booked intervals endpoint: basic param validation
  const from = new Date();
  const to = new Date(from.getTime() + 2 * 60 * 60_000);

  const bookedOk = await getJson(
    base,
    `/api/availability/therapist/${therapistId1}/booked?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
    asAuth(patientAuth.accessToken),
  );
  assert(
    bookedOk.ok,
    `Expected booked intervals ok, got ${bookedOk.status}: ${bookedOk.text}`,
  );

  const bookedBad = await getJson(
    base,
    `/api/availability/therapist/${therapistId1}/booked?from=${encodeURIComponent(to.toISOString())}&to=${encodeURIComponent(from.toISOString())}`,
    asAuth(patientAuth.accessToken),
  );
  assert(
    !bookedBad.ok && bookedBad.status === 400,
    `Expected booked intervals bad range 400, got ${bookedBad.status}`,
  );
  assert(
    String(bookedBad.text || "")
      .toLowerCase()
      .includes("must be after"),
    `Expected booked intervals error message, got: ${bookedBad.text}`,
  );

  console.log("OK: therapist schedule (availability) smoke passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
