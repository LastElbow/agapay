import readline from "node:readline";

export function normalizeBaseUrl(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

export async function postJson(baseUrl, path, body) {
  if (typeof fetch !== "function") {
    throw new Error(
      "Global fetch() is not available. Use Node 18+ (or add a fetch polyfill).",
    );
  }

  const base = normalizeBaseUrl(baseUrl);
  const url = `${base}${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  return {
    url,
    status: res.status,
    ok: res.ok,
    data,
    text,
  };
}

export function redactToken(token) {
  if (!token) return "(none)";
  const t = String(token);
  if (t.length <= 18) return `${t.slice(0, 6)}…${t.slice(-4)}`;
  return `${t.slice(0, 10)}…${t.slice(-6)}`;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await new Promise((resolve) =>
      rl.question(question, resolve),
    );
    return String(answer ?? "").trim();
  } finally {
    rl.close();
  }
}

export function logJson(label, obj) {
  // Keep logs compact but useful.
  const safe = obj == null ? obj : JSON.parse(JSON.stringify(obj));
  console.log(label, JSON.stringify(safe, null, 2));
}

function readKnownEnv(name) {
  switch (name) {
    case "AGAPAY_API_BASE_URL":
      return process.env.AGAPAY_API_BASE_URL;
    case "AGAPAY_ROLE":
      return process.env.AGAPAY_ROLE;
    case "AGAPAY_EMAIL":
      return process.env.AGAPAY_EMAIL;
    case "AGAPAY_PASSWORD":
      return process.env.AGAPAY_PASSWORD;
    case "AGAPAY_DEVICE_ID":
      return process.env.AGAPAY_DEVICE_ID;
    case "AGAPAY_DEVICE_NAME":
      return process.env.AGAPAY_DEVICE_NAME;
    case "AGAPAY_OTP_CODE":
      return process.env.AGAPAY_OTP_CODE;
    case "AGAPAY_ADMIN_EMAIL":
      return process.env.AGAPAY_ADMIN_EMAIL;
    case "AGAPAY_ADMIN_PASSWORD":
      return process.env.AGAPAY_ADMIN_PASSWORD;
    case "AGAPAY_LICENSE_NUMBER":
      return process.env.AGAPAY_LICENSE_NUMBER;
    case "AGAPAY_FEE_PER_SESSION":
      return process.env.AGAPAY_FEE_PER_SESSION;
    default:
      return undefined;
  }
}

export function env(name, fallback = undefined) {
  const v = readKnownEnv(name);
  if (v == null) return fallback;
  const trimmed = String(v).trim();
  return trimmed.length ? trimmed : fallback;
}
