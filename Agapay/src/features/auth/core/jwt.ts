// Pure helpers for working with JWTs (no storage/network).

function base64UrlToBase64(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad === 0) return base64;
  return base64 + '='.repeat(4 - pad);
}

function decodeBase64(base64: string): string {
  // atob in browsers; Buffer in Node.
  if (typeof atob === 'function') return atob(base64);
  if (typeof Buffer !== 'undefined') return Buffer.from(base64, 'base64').toString('binary');
  throw new Error('No base64 decoder available');
}

export type JwtPayload = Record<string, any>;

export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const json = decodeBase64(base64UrlToBase64(parts[1]));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Returns exp in seconds since epoch.
export function decodeJwtExp(token: string | null): number | null {
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  return typeof exp === 'number' ? exp : null;
}
