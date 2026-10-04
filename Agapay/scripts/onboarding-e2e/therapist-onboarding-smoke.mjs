#!/usr/bin/env node
import { DEFAULT_BASE_URL, loginAdmin, registerAndVerifyOtp } from "./auth.mjs";
import {
  env,
  getJson,
  logJson,
  postForm,
  postJson,
  redactToken,
  sleep,
  tinyPngBlob,
} from "./lib.mjs";

function pickFirstId(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const first = list[0];
  if (first == null) return null;
  const id = first.id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

async function main() {
  const baseUrl = env("AGAPAY_API_BASE_URL", DEFAULT_BASE_URL);

  console.log("Therapist onboarding E2E smoke");
  console.log("  baseUrl:", baseUrl);

  const therapistSession = await registerAndVerifyOtp({
    baseUrl,
    role: "PhysicalTherapist",
  });

  console.log("Signed in as therapist:", therapistSession.email);
  console.log("  accessToken:", redactToken(therapistSession.accessToken));

  await sleep(100);

  // 1) Check verification status before submission
  const statusBefore = await getJson(
    baseUrl,
    "/api/Onboarding/therapist/verification-status",
    {
      accessToken: therapistSession.accessToken,
    },
  );
  if (!statusBefore.ok) {
    throw new Error(
      `GET therapist/verification-status failed ${statusBefore.status}: ${statusBefore.text}`,
    );
  }
  logJson("Verification status (before):", statusBefore.data);

  // 2) Submit license (multipart)
  const licenseForm = new FormData();
  licenseForm.append(
    "LicenseNumber",
    env("AGAPAY_LICENSE_NUMBER", "PRC-E2E-0001"),
  );
  licenseForm.append("Gender", "Male");
  licenseForm.append("licenseImage", tinyPngBlob(), "license.png");

  const licenseRes = await postForm(
    baseUrl,
    "/api/Onboarding/therapist/submit-license",
    licenseForm,
    {
      accessToken: therapistSession.accessToken,
    },
  );

  if (!licenseRes.ok) {
    console.error("License submit failed:", licenseRes.status);
    logJson("Response:", licenseRes.data ?? licenseRes.text);
    process.exitCode = 1;
    return;
  }
  logJson("License submit OK:", licenseRes.data);

  await sleep(150);

  const statusPending = await getJson(
    baseUrl,
    "/api/Onboarding/therapist/verification-status",
    {
      accessToken: therapistSession.accessToken,
    },
  );
  if (!statusPending.ok) {
    throw new Error(
      `GET therapist/verification-status (pending) failed ${statusPending.status}: ${statusPending.text}`,
    );
  }
  logJson("Verification status (pending):", statusPending.data);

  // 3) Admin approves therapist so /api/Onboarding/therapist can succeed
  const admin = await loginAdmin({ baseUrl });
  console.log("Admin login OK:", admin.email);
  console.log("  admin accessToken:", redactToken(admin.accessToken));

  const submissions = await getJson(baseUrl, "/api/Admin/submissions", {
    accessToken: admin.accessToken,
  });
  if (!submissions.ok) {
    throw new Error(
      `GET /api/Admin/submissions failed ${submissions.status}: ${submissions.text}`,
    );
  }

  const mine = (submissions.data ?? []).find(
    (s) =>
      String(s?.email ?? "").toLowerCase() ===
      therapistSession.email.toLowerCase(),
  );
  if (!mine?.id) {
    console.error(
      "Could not find therapist submission for:",
      therapistSession.email,
    );
    logJson("Submissions sample:", (submissions.data ?? []).slice(0, 3));
    process.exitCode = 1;
    return;
  }

  const approve = await postJson(
    baseUrl,
    `/api/Admin/therapist-verifications/${mine.id}/verify`,
    { isApproved: true },
    { accessToken: admin.accessToken },
  );

  if (!approve.ok) {
    console.error("Admin approve failed:", approve.status);
    logJson("Response:", approve.data ?? approve.text);
    process.exitCode = 1;
    return;
  }
  logJson("Admin approve OK:", approve.data);

  await sleep(150);

  const statusVerified = await getJson(
    baseUrl,
    "/api/Onboarding/therapist/verification-status",
    {
      accessToken: therapistSession.accessToken,
    },
  );
  if (!statusVerified.ok) {
    throw new Error(
      `GET therapist/verification-status (verified) failed ${statusVerified.status}: ${statusVerified.text}`,
    );
  }
  logJson("Verification status (verified):", statusVerified.data);

  // 4) Fetch onboarding reference data and pick IDs
  const specs = await getJson(baseUrl, "/api/Onboarding/specializations", {
    accessToken: therapistSession.accessToken,
  });
  if (!specs.ok)
    throw new Error(
      `GET /specializations failed ${specs.status}: ${specs.text}`,
    );

  const specializationId = pickFirstId(specs.data);
  if (!specializationId)
    throw new Error("No specializationId found. Seed data missing?");

  const conditionsGrouped = await getJson(
    baseUrl,
    `/api/Onboarding/conditions-grouped?specializationIds=${encodeURIComponent(String(specializationId))}`,
    { accessToken: therapistSession.accessToken },
  );
  if (!conditionsGrouped.ok)
    throw new Error(
      `GET /conditions-grouped failed ${conditionsGrouped.status}: ${conditionsGrouped.text}`,
    );

  const firstGroup = Array.isArray(conditionsGrouped.data)
    ? conditionsGrouped.data.find(
        (g) => Array.isArray(g?.items) && g.items.length > 0,
      )
    : null;
  const conditionId = firstGroup ? pickFirstId(firstGroup.items) : null;
  if (!conditionId) throw new Error("No conditionId found. Seed data missing?");

  const serviceAreas = await getJson(baseUrl, "/api/Onboarding/service-areas", {
    accessToken: therapistSession.accessToken,
  });
  if (!serviceAreas.ok)
    throw new Error(
      `GET /service-areas failed ${serviceAreas.status}: ${serviceAreas.text}`,
    );

  const serviceAreaId = pickFirstId(serviceAreas.data);
  if (!serviceAreaId)
    throw new Error("No serviceAreaId found. Seed data missing?");

  // 5) Complete therapist onboarding (multipart)
  const onboardingForm = new FormData();
  onboardingForm.append("FeePerSession", env("AGAPAY_FEE_PER_SESSION", "1500"));
  onboardingForm.append("SpecializationIds", String(specializationId));
  onboardingForm.append("ConditionIds", String(conditionId));
  onboardingForm.append("ServiceAreasIds", String(serviceAreaId));
  onboardingForm.append("OtherConditionsList", "E2E custom condition");
  onboardingForm.append("Gender", "Male");
  onboardingForm.append("profilePicture", tinyPngBlob(), "profile.png");

  const complete = await postForm(
    baseUrl,
    "/api/Onboarding/therapist",
    onboardingForm,
    {
      accessToken: therapistSession.accessToken,
    },
  );

  if (!complete.ok) {
    console.error("Therapist onboarding submit failed:", complete.status);
    logJson("Response:", complete.data ?? complete.text);
    process.exitCode = 1;
    return;
  }

  logJson("Therapist onboarding submit OK:", complete.data);
  console.log("Therapist onboarding E2E: PASS");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exitCode = 1;
});
