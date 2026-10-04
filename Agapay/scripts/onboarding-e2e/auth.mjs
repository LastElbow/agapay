import { env, makeDemoEmail, postJson, prompt } from "./lib.mjs";

export const DEFAULT_BASE_URL = "http://localhost:5211";

export function defaultPassword() {
  // Must match backend Identity requirements (digit + non-alphanumeric + length >= 8)
  return env("AGAPAY_PASSWORD", "Test12345!");
}

export function makeRegisterPayload({ role, email, password }) {
  const payload = {
    email,
    password,
    firstName: "E2E",
    lastName: "Onboarding",
    dateOfBirth: "1990-01-01",
    gender: "Male",
  };

  if (role === "PhysicalTherapist") {
    payload.desiredRole = "PhysicalTherapist";
  }

  return payload;
}

export async function registerAndVerifyOtp({ baseUrl, role }) {
  const email = env(
    "AGAPAY_EMAIL",
    makeDemoEmail(
      role === "Patient"
        ? "e2e-onboarding-patient"
        : "e2e-onboarding-therapist",
    ),
  );
  const password = defaultPassword();

  const registerEndpoint =
    role === "Patient" ? "/api/Auth/register/patient" : "/api/Auth/register";

  const registerRes = await postJson(
    baseUrl,
    registerEndpoint,
    makeRegisterPayload({ role, email, password }),
  );
  if (!registerRes.ok) {
    throw new Error(
      `Register failed ${registerRes.status}: ${registerRes.text}`,
    );
  }

  const challenge = registerRes.data ?? {};
  const purpose = challenge.purpose ?? "AccountVerification";

  let code = env("AGAPAY_OTP_CODE", null);
  if (!code && /@demo\.agapay\.com$/i.test(email)) {
    code = "123456";
  }
  if (!code) {
    code = await prompt("Enter OTP code: ");
  }

  const verifyRes = await postJson(baseUrl, "/api/Auth/verify-otp", {
    email,
    code,
    purpose,
    rememberDevice: true,
    deviceId: env("AGAPAY_DEVICE_ID", `e2e-device-${Date.now()}`),
    deviceName: env("AGAPAY_DEVICE_NAME", "E2E Onboarding Script"),
  });

  if (!verifyRes.ok) {
    throw new Error(`Verify OTP failed ${verifyRes.status}: ${verifyRes.text}`);
  }

  const auth = verifyRes.data ?? {};
  const accessToken = auth.accessToken ?? null;
  const refreshToken = auth.refreshToken ?? null;

  if (!accessToken) {
    throw new Error("Verify OTP succeeded but no accessToken returned.");
  }

  return {
    email,
    password,
    accessToken,
    refreshToken,
    user: auth.user ?? null,
  };
}

export async function loginAdmin({ baseUrl }) {
  const email = env("AGAPAY_ADMIN_EMAIL", "admin@demo.agapay.com");
  const password = env("AGAPAY_ADMIN_PASSWORD", "Password123!");

  const res = await postJson(baseUrl, "/api/Auth/login", { email, password });
  if (!res.ok) {
    throw new Error(`Admin login failed ${res.status}: ${res.text}`);
  }

  const data = res.data ?? {};
  if (!data.accessToken) {
    throw new Error("Admin login succeeded but no accessToken returned.");
  }

  return {
    email,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken ?? null,
    user: data.user ?? null,
  };
}
