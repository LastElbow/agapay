#!/usr/bin/env node
import { env, logJson, postJson, prompt, redactToken, sleep } from "./lib.mjs";

const DEFAULT_BASE_URL = "http://localhost:5211";

function pickRole(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return "Patient";
  if (raw === "Patient" || raw === "PhysicalTherapist") return raw;
  // allow a couple shorthands
  if (/^pt$/i.test(raw) || /therapist/i.test(raw)) return "PhysicalTherapist";
  return "Patient";
}

function makeDemoEmail(prefix = "e2e") {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  const rand = Math.random().toString(16).slice(2, 8);
  return `${prefix}+${stamp}${rand}@demo.agapay.com`;
}

function defaultRegisterPayload({ email, password, role }) {
  const payload = {
    email,
    password,
    firstName: "E2E",
    lastName: "Test",
    dateOfBirth: "1990-01-01",
    gender: "Male",
  };
  if (role === "PhysicalTherapist") {
    payload.desiredRole = "PhysicalTherapist";
  }
  return payload;
}

function getRegisterEndpoint(role) {
  // Mirrors frontend helper: Patient -> /register/patient, PT -> /register
  return role === "Patient"
    ? "/api/Auth/register/patient"
    : "/api/Auth/register";
}

function getLoginEndpoint(role) {
  return role === "Patient"
    ? "/api/Auth/login/patient"
    : "/api/Auth/login/therapist";
}

async function main() {
  const baseUrl = env("AGAPAY_API_BASE_URL", DEFAULT_BASE_URL);
  const role = pickRole(env("AGAPAY_ROLE", "Patient"));

  const email = env(
    "AGAPAY_EMAIL",
    makeDemoEmail(role === "Patient" ? "e2e-patient" : "e2e-therapist"),
  );
  // ASP.NET Identity defaults require at least one non-alphanumeric character.
  const password = env("AGAPAY_PASSWORD", "Test12345!");

  const deviceId = env("AGAPAY_DEVICE_ID", `e2e-device-${Date.now()}`);
  const deviceName = env("AGAPAY_DEVICE_NAME", "E2E Script");

  console.log("Auth smoke test");
  console.log("  baseUrl :", baseUrl);
  console.log("  role    :", role);
  console.log("  email   :", email);
  console.log("  deviceId:", deviceId);

  // ------------------------------------------------------------
  // 1) Register -> should return OTP challenge
  // ------------------------------------------------------------
  const registerEndpoint = getRegisterEndpoint(role);
  console.log("\n[1/4] Register:", registerEndpoint);
  const registerRes = await postJson(
    baseUrl,
    registerEndpoint,
    defaultRegisterPayload({ email, password, role }),
  );

  if (!registerRes.ok) {
    console.error("Register failed:", registerRes.status, registerRes.url);
    logJson("Response:", registerRes.data ?? registerRes.text);
    process.exitCode = 1;
    return;
  }

  logJson("Register OK:", registerRes.data);

  // ------------------------------------------------------------
  // 2) Verify OTP (AccountVerification)
  // ------------------------------------------------------------
  const challenge = registerRes.data ?? {};
  const purpose = challenge.purpose ?? "AccountVerification";

  if (challenge.requiresOtp === false) {
    console.log("\n[2/4] OTP not required (unexpected for register)");
  } else {
    console.log(`\n[2/4] Verify OTP: purpose=${purpose}`);

    let code = env("AGAPAY_OTP_CODE", null);
    if (!code && /@demo\.agapay\.com$/i.test(email)) {
      code = "123456";
    }
    if (!code) {
      code = await prompt("Enter OTP code: ");
    }

    const verifyPayload = {
      email,
      code,
      purpose,
      deviceId,
      deviceName,
      rememberDevice: true,
    };

    let verifyRes = await postJson(
      baseUrl,
      "/api/Auth/verify-otp",
      verifyPayload,
    );

    // If we guessed 123456 for demo accounts but bypass isn't enabled,
    // give one interactive retry.
    if (!verifyRes.ok && code === "123456" && !env("AGAPAY_OTP_CODE", null)) {
      console.warn(
        "OTP verify failed with 123456; retrying with manual input...",
      );
      logJson("Verify error:", verifyRes.data ?? verifyRes.text);
      const manual = await prompt("Enter OTP code (manual): ");
      verifyRes = await postJson(baseUrl, "/api/Auth/verify-otp", {
        ...verifyPayload,
        code: manual,
      });
    }

    if (!verifyRes.ok) {
      console.error("Verify OTP failed:", verifyRes.status, verifyRes.url);
      logJson("Response:", verifyRes.data ?? verifyRes.text);
      process.exitCode = 1;
      return;
    }

    const tokens = verifyRes.data ?? {};
    console.log("Verify OTP OK");
    console.log("  accessToken :", redactToken(tokens.accessToken));
    console.log("  refreshToken:", redactToken(tokens.refreshToken));
  }

  // Small delay to reduce rate-limit flakiness if enabled
  await sleep(150);

  // ------------------------------------------------------------
  // 3) Login (role-specific); may return tokens OR OTP challenge
  // ------------------------------------------------------------
  const loginEndpoint = getLoginEndpoint(role);
  console.log("\n[3/4] Login:", loginEndpoint);

  const loginRes = await postJson(baseUrl, loginEndpoint, {
    email,
    password,
    deviceId,
    deviceName,
  });

  if (!loginRes.ok) {
    console.error("Login failed:", loginRes.status, loginRes.url);
    logJson("Response:", loginRes.data ?? loginRes.text);
    process.exitCode = 1;
    return;
  }

  const loginData = loginRes.data ?? {};

  let accessToken = loginData.accessToken ?? null;
  let refreshToken = loginData.refreshToken ?? null;

  if (accessToken) {
    console.log("Login OK");
    console.log("  accessToken :", redactToken(accessToken));
    console.log("  refreshToken:", redactToken(refreshToken));
  } else if (loginData.requiresOtp) {
    console.log("Login returned OTP challenge");
    logJson("Challenge:", loginData);

    let code = env("AGAPAY_OTP_CODE", null);
    if (!code && /@demo\.agapay\.com$/i.test(email)) {
      code = "123456";
    }
    if (!code) {
      code = await prompt("Enter OTP code (TwoFactorLogin): ");
    }

    const verifyRes = await postJson(baseUrl, "/api/Auth/verify-otp", {
      email,
      code,
      purpose: loginData.purpose ?? "TwoFactorLogin",
      deviceId,
      deviceName,
      rememberDevice: true,
    });

    if (!verifyRes.ok) {
      console.error(
        "Verify OTP (TwoFactorLogin) failed:",
        verifyRes.status,
        verifyRes.url,
      );
      logJson("Response:", verifyRes.data ?? verifyRes.text);
      process.exitCode = 1;
      return;
    }

    accessToken = verifyRes.data?.accessToken ?? null;
    refreshToken = verifyRes.data?.refreshToken ?? null;

    console.log("2FA OK");
    console.log("  accessToken :", redactToken(accessToken));
    console.log("  refreshToken:", redactToken(refreshToken));
  } else {
    console.error(
      "Login succeeded but returned neither tokens nor OTP challenge.",
    );
    logJson("Response:", loginData);
    process.exitCode = 1;
    return;
  }

  if (!accessToken || !refreshToken) {
    console.warn("Skipping refresh: missing tokens.");
    return;
  }

  await sleep(150);

  // ------------------------------------------------------------
  // 4) Refresh token
  // ------------------------------------------------------------
  console.log("\n[4/4] Refresh token: /api/Auth/refresh");
  const refreshRes = await postJson(baseUrl, "/api/Auth/refresh", {
    accessToken,
    refreshToken,
  });

  if (!refreshRes.ok) {
    console.error("Refresh failed:", refreshRes.status, refreshRes.url);
    logJson("Response:", refreshRes.data ?? refreshRes.text);
    process.exitCode = 1;
    return;
  }

  console.log("Refresh OK");
  console.log("  newAccessToken :", redactToken(refreshRes.data?.accessToken));
  console.log("  newRefreshToken:", redactToken(refreshRes.data?.refreshToken));
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exitCode = 1;
});
