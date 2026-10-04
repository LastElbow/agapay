import { Platform } from 'react-native';
import { getItem as storageGet, setItem as storageSet } from '@/src/utils/safeSecureStore';

const DEVICE_ID_KEY = 'deviceId';

function generateDeviceId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // ignore and fall back to manual generation
  }

  const randomPart = Math.random().toString(36).slice(2, 10);
  const timestampPart = Date.now().toString(36);
  return `agp-${randomPart}-${timestampPart}`;
}

function computeDeviceName(): string {
  const parts: string[] = [];
  parts.push(Platform.OS);

  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    if (Platform.Version != null) {
      parts.push(String(Platform.Version));
    }
  } else if (Platform.OS === 'web') {
    try {
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      if (userAgent) parts.push(userAgent);
    } catch {
      // ignore user agent errors
    }
  }

  return parts.join(' | ') || 'unknown-device';
}

let cachedFingerprint: { deviceId: string; deviceName: string } | null = null;

export async function getDeviceFingerprint(): Promise<{ deviceId: string; deviceName: string }> {
  if (cachedFingerprint) return cachedFingerprint;

  let deviceId = (await storageGet(DEVICE_ID_KEY)) ?? null;
  if (!deviceId) {
    deviceId = generateDeviceId();
    try {
      await storageSet(DEVICE_ID_KEY, deviceId, { scope: 'local' });
    } catch {
      // Ignore write failures; fingerprint will regenerate next time if needed
    }
  }

  const deviceName = computeDeviceName();
  cachedFingerprint = { deviceId, deviceName };
  return cachedFingerprint;
}
