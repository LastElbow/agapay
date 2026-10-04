import {
  env,
  normalizeBaseUrl,
  getJson,
  postForm,
  fetchJson,
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

async function putJson(baseUrl, path, body, { accessToken } = {}) {
  const base = normalizeBaseUrl(baseUrl);
  const url = `${base}${path}`;

  return fetchJson(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
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

async function fetchPatientMe({ base, token }) {
  const res = await getJson(base, "/api/patient/me", asAuth(token));
  if (!res.ok)
    throw new Error(`GET /api/patient/me failed ${res.status}: ${res.text}`);
  return res.data ?? {};
}

async function fetchTherapistMeDetails({ base, token }) {
  const res = await getJson(base, "/api/Therapist/me/details", asAuth(token));
  if (!res.ok)
    throw new Error(
      `GET /api/Therapist/me/details failed ${res.status}: ${res.text}`,
    );
  return res.data ?? {};
}

async function fetchServiceAreas({ base, token }) {
  const res = await getJson(
    base,
    "/api/Onboarding/service-areas",
    asAuth(token),
  );
  if (!res.ok)
    throw new Error(
      `GET /api/Onboarding/service-areas failed ${res.status}: ${res.text}`,
    );
  return Array.isArray(res.data) ? res.data : [];
}

(async function main() {
  const base = baseUrl();
  console.log("Profile edit E2E smoke");
  console.log("  baseUrl:", base);

  // Register accounts
  const patientAuth = await registerAndVerifyOtp({
    baseUrl: base,
    role: "Patient",
  });
  const therapistAuth = await registerAndVerifyOtp({
    baseUrl: base,
    role: "PhysicalTherapist",
  });

  // --- Role guards (basic sanity) ---
  {
    const asTherapistToPatient = await getJson(
      base,
      "/api/patient/me",
      asAuth(therapistAuth.accessToken),
    );
    assert(
      !asTherapistToPatient.ok,
      "Expected therapist token to be rejected by GET /api/patient/me",
    );

    const asPatientToTherapist = await getJson(
      base,
      "/api/Therapist/me/details",
      asAuth(patientAuth.accessToken),
    );
    assert(
      !asPatientToTherapist.ok,
      "Expected patient token to be rejected by GET /api/Therapist/me/details",
    );
  }

  // --- Patient update ---
  {
    const updateBody = {
      firstName: "E2E",
      lastName: "Patient",
      relationshipToUser: "Self",
      dateOfBirth: "1998-03-17",
      gender: "Female",
      address: "123 Test Street",
      barangay: "Barangay 1",
      latitude: 14.5995,
      longitude: 120.9842,
    };

    const putRes = await putJson(
      base,
      "/api/patient/me",
      updateBody,
      asAuth(patientAuth.accessToken),
    );
    if (!putRes.ok) {
      throw new Error(
        `PUT /api/patient/me failed ${putRes.status}: ${putRes.text}`,
      );
    }

    // Verify with GET
    const me = await fetchPatientMe({ base, token: patientAuth.accessToken });
    assert(
      String(me.firstName ?? "").trim() === "E2E",
      `Expected patient firstName=E2E, got ${me.firstName}`,
    );
    assert(
      String(me.lastName ?? "").trim() === "Patient",
      `Expected patient lastName=Patient, got ${me.lastName}`,
    );
    assert(
      String(me.relationshipToUser ?? "").trim() === "Self",
      `Expected relationshipToUser=Self, got ${me.relationshipToUser}`,
    );

    console.log("Patient profile updated OK");
  }

  // --- Therapist update ---
  {
    await ensureTherapistRecord({
      base,
      therapistToken: therapistAuth.accessToken,
    });

    const serviceAreas = await fetchServiceAreas({
      base,
      token: therapistAuth.accessToken,
    });
    const chosenIds = serviceAreas
      .map((a) => a?.id)
      .filter((id) => typeof id === "number" && Number.isFinite(id))
      .slice(0, 2);
    assert(
      chosenIds.length > 0,
      "Expected at least 1 service area id from /api/Onboarding/service-areas",
    );

    const updateBody = {
      firstName: "E2E",
      lastName: "Therapist",
      dateOfBirth: "1990-01-02",
      gender: "Male",
      feePerSession: 1337,
      otherConditions: "asthma",
      // This intentionally replaces service areas to validate the backend contract.
      serviceAreasIds: chosenIds,
    };

    const putRes = await putJson(
      base,
      "/api/Therapist/me",
      updateBody,
      asAuth(therapistAuth.accessToken),
    );
    if (!putRes.ok) {
      throw new Error(
        `PUT /api/Therapist/me failed ${putRes.status}: ${putRes.text}`,
      );
    }

    // Give backend a moment to persist before read-back.
    await sleep(100);

    const details = await fetchTherapistMeDetails({
      base,
      token: therapistAuth.accessToken,
    });
    assert(
      String(details.firstName ?? "").trim() === "E2E",
      `Expected therapist firstName=E2E, got ${details.firstName}`,
    );
    assert(
      String(details.lastName ?? "").trim() === "Therapist",
      `Expected therapist lastName=Therapist, got ${details.lastName}`,
    );
    assert(
      String(details.gender ?? "").trim() === "Male",
      `Expected therapist gender=Male, got ${details.gender}`,
    );

    const serverAreaIds = Array.isArray(details.serviceAreaIds)
      ? details.serviceAreaIds
      : [];
    for (const id of chosenIds) {
      assert(
        serverAreaIds.includes(id),
        `Expected therapist serviceAreaIds to include ${id}, got ${JSON.stringify(serverAreaIds)}`,
      );
    }

    console.log("Therapist profile updated OK");
  }

  console.log("Profile edit E2E: PASS");
})().catch((err) => {
  console.error("Profile edit E2E: FAIL");
  console.error(err);
  process.exitCode = 1;
});
