import { Buffer } from "node:buffer";
import {
  normalizeBaseUrl,
  redactToken,
  env,
  logJson,
  prompt,
  sleep,
} from "../auth-e2e/lib.mjs";

export { normalizeBaseUrl, redactToken, env, logJson, prompt, sleep };

export async function fetchJson(url, options) {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch() is not available. Use Node 18+.");
  }

  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  return {
    ok: res.ok,
    status: res.status,
    url,
    data,
    text,
    headers: res.headers,
  };
}

export async function getJson(baseUrl, path, { accessToken } = {}) {
  const base = normalizeBaseUrl(baseUrl);
  const url = `${base}${path}`;

  return fetchJson(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
}

export async function postJson(baseUrl, path, body, { accessToken } = {}) {
  const base = normalizeBaseUrl(baseUrl);
  const url = `${base}${path}`;

  return fetchJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
}

export async function postForm(baseUrl, path, formData, { accessToken } = {}) {
  const base = normalizeBaseUrl(baseUrl);
  const url = `${base}${path}`;

  // NOTE: do NOT set Content-Type manually; fetch will add the boundary.
  return fetchJson(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: formData,
  });
}

export function makeDemoEmail(prefix = "e2e") {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  const rand = Math.random().toString(16).slice(2, 8);
  return `${prefix}+${stamp}${rand}@demo.agapay.com`;
}

export function tinyPngBlob() {
  // 1x1 transparent PNG
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axlJ1kAAAAASUVORK5CYII=";
  const bytes = Buffer.from(base64, "base64");
  return new Blob([bytes], { type: "image/png" });
}
