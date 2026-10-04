// A thin wrapper around expo-secure-store providing fallbacks for web / unsupported platforms.
import * as SecureStore from 'expo-secure-store';

// In web builds SecureStore often no-ops or lacks native methods; provide localStorage fallback, then in-memory.
const memoryStore: Record<string, string> = {};

let localStorageSupport: boolean | null = null;
let sessionStorageSupport: boolean | null = null;
let allowSensitiveLocalStorageCache: boolean | null = null;

function hasLocalStorage(): boolean {
  if (localStorageSupport !== null) return localStorageSupport;
  if (typeof window === 'undefined') return false;
  try {
    if (!window.localStorage) return (localStorageSupport = false);
    // basic test write/remove to ensure availability (handles Safari private mode)
    const k = '__agapay_ss_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    localStorageSupport = true;
  } catch {
    localStorageSupport = false;
  }
  return localStorageSupport;
}

function hasSessionStorage(): boolean {
  if (sessionStorageSupport !== null) return sessionStorageSupport;
  if (typeof window === 'undefined') return false;
  try {
    if (!window.sessionStorage) return (sessionStorageSupport = false);
    const k = '__agapay_ss_session_probe__';
    window.sessionStorage.setItem(k, '1');
    window.sessionStorage.removeItem(k);
    sessionStorageSupport = true;
  } catch {
    sessionStorageSupport = false;
  }
  return sessionStorageSupport;
}

function allowSensitiveLocalStorage(): boolean {
  if (allowSensitiveLocalStorageCache !== null) return allowSensitiveLocalStorageCache;
  if (!hasLocalStorage()) return false;
  if (typeof window === 'undefined') return false;
  try {
    const hostname = window.location?.hostname ?? '';
    const protocol = window.location?.protocol ?? '';
    const isLocalhost = /^localhost$|^127\./.test(hostname) || hostname === '0.0.0.0';
    const isHttps = protocol === 'https:';
    allowSensitiveLocalStorageCache = isHttps || isLocalhost;
  } catch {
    allowSensitiveLocalStorageCache = false;
  }
  return allowSensitiveLocalStorageCache;
}

// Keys that should never be stored in localStorage on web (XSS risk)
const SENSITIVE_KEYS = new Set<string>(['accessToken', 'refreshToken', 'user']);

// Cookie helpers
function setCookie(name: string, value: string, days?: number) {
  if (typeof document === 'undefined') return;
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toUTCString();
  }
  // SameSite=Lax is a good default; Secure should be used if on https
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  document.cookie = name + "=" + (value || "") + expires + "; path=/" + (isSecure ? "; Secure" : "") + "; SameSite=Lax";
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) == ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

function eraseCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = name + '=; Max-Age=-99999999; path=/';
}

const canPersistInLocal = (key: string) => {
  if (!hasLocalStorage()) return false;
  if (!SENSITIVE_KEYS.has(key)) return true;
  return allowSensitiveLocalStorage();
};

async function isAvailable(): Promise<boolean> {
  try {
    if (typeof SecureStore.isAvailableAsync === 'function') {
      return await SecureStore.isAvailableAsync();
    }
  } catch { }
  // Assume unavailable if call fails on web fallback
  return false;
}

export async function getItem(key: string): Promise<string | null> {
  try {
    if (await isAvailable()) {
      return (await SecureStore.getItemAsync(key)) ?? null;
    }

    // For sensitive keys, ONLY check sessionStorage (tab-specific storage)
    // This ensures new tabs don't inherit sessions from other tabs
    if (SENSITIVE_KEYS.has(key)) {
      if (hasSessionStorage()) {
        try {
          const v = window.sessionStorage.getItem(key);
          if (v != null) return v;
        } catch { }
      }
      return memoryStore[key] ?? null;
    }

    // Non-sensitive keys: check sessionStorage first, then localStorage
    if (hasSessionStorage()) {
      try { const v = window.sessionStorage.getItem(key); if (v != null) return v; } catch { }
    }
    if (canPersistInLocal(key)) {
      try { return window.localStorage.getItem(key); } catch { }
    }
    return memoryStore[key] ?? null;
  } catch {
    try {
      if (SENSITIVE_KEYS.has(key)) {
        if (hasSessionStorage()) {
          const v = window.sessionStorage.getItem(key);
          if (v != null) return v;
        }
      } else {
        if (hasSessionStorage()) {
          const v = window.sessionStorage.getItem(key);
          if (v != null) return v;
        }
        if (canPersistInLocal(key)) return window.localStorage.getItem(key);
      }
    } catch { }
    return memoryStore[key] ?? null;
  }
}

type StorageScope = 'auto' | 'session' | 'local';
type SetItemOptions = {
  scope?: StorageScope;
};

export async function setItem(
  key: string,
  value: string | null,
  options?: SetItemOptions,
): Promise<void> {
  const scope = options?.scope ?? 'auto';
  try {
    if (value === null) {
      await deleteItem(key);
      return;
    }
    if (await isAvailable()) {
      await SecureStore.setItemAsync(key, value);
    } else {
      // Web fallback
      let wrote = false;

      // For sensitive keys, ALWAYS use sessionStorage to ensure tab isolation
      // (new tabs won't inherit the session from existing tabs)
      if (SENSITIVE_KEYS.has(key)) {
        if (hasSessionStorage()) {
          try {
            window.sessionStorage.setItem(key, value);
            wrote = true;
          } catch { }
        }

        // Clean up cookies and localStorage to avoid stale data
        try { eraseCookie(key); } catch { }
        try { if (hasLocalStorage()) window.localStorage.removeItem(key); } catch { }
      } else {
        // Non-sensitive: use storage based on scope
        if (scope !== 'local' && hasSessionStorage()) {
          try { window.sessionStorage.setItem(key, value); wrote = true; } catch { }
        }
        if (!wrote && scope !== 'session' && canPersistInLocal(key)) {
          try { window.localStorage.setItem(key, value); wrote = true; } catch { }
        }
      }

      if (!wrote) {
        memoryStore[key] = value;
      }

      // Cleanup if we wrote to storage (logic from before, adapted)
      if (!SENSITIVE_KEYS.has(key)) {
        if (scope === 'session') {
          try { if (canPersistInLocal(key)) window.localStorage.removeItem(key); } catch { }
        } else if (scope === 'local') {
          try { if (hasSessionStorage()) window.sessionStorage.removeItem(key); } catch { }
        }
      }
    }
  } catch {
    // Fallback error handling
    try {
      if (SENSITIVE_KEYS.has(key)) {
        // For sensitive keys, always try sessionStorage first for tab isolation
        if (hasSessionStorage()) {
          window.sessionStorage.setItem(key, value ?? '');
        } else {
          memoryStore[key] = value ?? '';
        }
      } else {
        if (scope === 'local') {
          if (canPersistInLocal(key)) {
            window.localStorage.setItem(key, value ?? '');
            return;
          }
        }
        if (scope !== 'local' && hasSessionStorage()) {
          window.sessionStorage.setItem(key, value ?? '');
        } else if (scope !== 'session' && canPersistInLocal(key)) {
          window.localStorage.setItem(key, value ?? '');
        } else {
          memoryStore[key] = value ?? '';
        }
      }
    } catch {
      memoryStore[key] = value ?? '';
    }
  }
}

export async function deleteItem(key: string): Promise<void> {
  try {
    if (await isAvailable()) {
      await SecureStore.deleteItemAsync(key);
    } else {
      // Web fallback - clean up all possible storage locations
      if (SENSITIVE_KEYS.has(key)) {
        // Clean up cookies (legacy) and localStorage (if any stale data exists)
        try { eraseCookie(key); } catch { }
        try { if (hasLocalStorage()) window.localStorage.removeItem(key); } catch { }
      }

      if (hasSessionStorage()) {
        try { window.sessionStorage.removeItem(key); } catch { }
      }
      if (canPersistInLocal(key)) {
        try { window.localStorage.removeItem(key); } catch { }
      }
      delete memoryStore[key];
    }
  } catch {
    try {
      if (SENSITIVE_KEYS.has(key)) {
        eraseCookie(key);
        if (hasLocalStorage()) window.localStorage.removeItem(key);
      }
      if (hasSessionStorage()) window.sessionStorage.removeItem(key);
    } catch { }
    delete memoryStore[key];
  }
}

export async function multiGet(keys: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const k of keys) {
    out[k] = await getItem(k);
  }
  return out;
}

export async function multiDelete(keys: string[]): Promise<void> {
  await Promise.all(keys.map(k => deleteItem(k)));
}
