#!/usr/bin/env node
import { DEFAULT_BASE_URL, registerAndVerifyOtp } from "./auth.mjs";
import { env, getJson, logJson, postJson, redactToken, sleep } from "./lib.mjs";

async function main() {
  const baseUrl = env("AGAPAY_API_BASE_URL", DEFAULT_BASE_URL);

  console.log("Patient onboarding E2E smoke");
  console.log("  baseUrl:", baseUrl);

  const session = await registerAndVerifyOtp({ baseUrl, role: "Patient" });

  console.log("Signed in as patient:", session.email);
  console.log("  accessToken:", redactToken(session.accessToken));

  await sleep(100);

  const beforeStatus = await getJson(
    baseUrl,
    "/api/Onboarding/patient/status",
    { accessToken: session.accessToken },
  );
  if (!beforeStatus.ok) {
    throw new Error(
      `GET /patient/status failed ${beforeStatus.status}: ${beforeStatus.text}`,
    );
  }
  logJson("Status before:", beforeStatus.data);

  const userInfo = await getJson(baseUrl, "/api/Onboarding/patient/user-info", {
    accessToken: session.accessToken,
  });
  if (!userInfo.ok) {
    throw new Error(
      `GET /patient/user-info failed ${userInfo.status}: ${userInfo.text}`,
    );
  }
  logJson("User info:", userInfo.data);

  // Mirror what the UI ultimately posts (except we ensure lat/lon are numbers for backend compatibility)
  const payload = {
    onboardingType: "ForMyself",
    firstName: userInfo.data?.firstName ?? "E2E",
    lastName: userInfo.data?.lastName ?? "Onboarding",
    dateOfBirth: userInfo.data?.dateOfBirth ?? "1990-01-01",
    relationshipToUser: "myself",
    address: "E2E Address, Davao City",
    latitude: 7.1907,
    longitude: 125.4553,
    occupation: "Developer",
    activityLevel: "light",
    currentComplaints: "Lower back pain when sitting long periods",
    gender: "Male",
  };

  const submit = await postJson(baseUrl, "/api/Onboarding/patient", payload, {
    accessToken: session.accessToken,
  });
  if (!submit.ok) {
    console.error("Submit failed:", submit.status);
    logJson("Response:", submit.data ?? submit.text);
    process.exitCode = 1;
    return;
  }

  logJson("Submit OK:", submit.data);

  await sleep(100);

  const afterStatus = await getJson(baseUrl, "/api/Onboarding/patient/status", {
    accessToken: session.accessToken,
  });
  if (!afterStatus.ok) {
    throw new Error(
      `GET /patient/status (after) failed ${afterStatus.status}: ${afterStatus.text}`,
    );
  }
  logJson("Status after:", afterStatus.data);

  if (afterStatus.data?.isPatientOnboardingComplete !== true) {
    throw new Error(
      "Expected isPatientOnboardingComplete=true after onboarding submit.",
    );
  }

  console.log("Patient onboarding E2E: PASS");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exitCode = 1;
});
