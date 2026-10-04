import type { AuthRole } from '@/src/utils/authNavigation';
import type {
  AuthResponse,
  OtpChallengeResponse,
  OtpPurpose,
  VerifyOtpPayload,
} from '@/api/client';

export type Fingerprint = {
  deviceId?: string | null;
  deviceName?: string | null;
} | null;

export function getParam(value?: string | string[]): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export function parseRoleHint(raw: string | undefined): AuthRole {
  if (!raw) return null;
  if (raw === 'PhysicalTherapist') return 'PhysicalTherapist';
  if (raw === 'Patient') return 'Patient';
  return null;
}

export function parsePurpose(raw: string | undefined): OtpPurpose {
  if (raw === 'TwoFactorLogin') return 'TwoFactorLogin';
  if (raw === 'PasswordReset') return 'PasswordReset';
  return 'AccountVerification';
}

export function allowRememberDeviceForPurpose(purpose: OtpPurpose): boolean {
  return purpose !== 'PasswordReset';
}

export function normalizeRememberDevice(purpose: OtpPurpose, rememberDevice: boolean): boolean {
  return allowRememberDeviceForPurpose(purpose) ? rememberDevice : false;
}

export function canResendOtp(args: {
  isResending: boolean;
  remainingSeconds: number;
  email: string;
}): boolean {
  if (args.isResending) return false;
  if (args.remainingSeconds > 0) return false;
  return Boolean(args.email);
}

export function buildVerifyOtpPayload(args: {
  email: string;
  code: string;
  purpose: OtpPurpose;
  fingerprint: Fingerprint;
  rememberDevice: boolean;
}): VerifyOtpPayload {
  return {
    email: args.email,
    code: args.code,
    purpose: args.purpose,
    deviceId: args.fingerprint?.deviceId ?? undefined,
    deviceName: args.fingerprint?.deviceName ?? undefined,
    rememberDevice: normalizeRememberDevice(args.purpose, args.rememberDevice),
  };
}

export async function verifyOtpCode(args: {
  verifyOtpFn: (payload: VerifyOtpPayload) => Promise<AuthResponse>;
  email: string;
  code: string;
  purpose: OtpPurpose;
  fingerprint: Fingerprint;
  rememberDevice: boolean;
}): Promise<AuthResponse> {
  const payload = buildVerifyOtpPayload({
    email: args.email,
    code: args.code,
    purpose: args.purpose,
    fingerprint: args.fingerprint,
    rememberDevice: args.rememberDevice,
  });
  return args.verifyOtpFn(payload);
}

export async function resendOtpCode(args: {
  requestOtpFn: (
    email: string,
    purpose: OtpPurpose,
    device?: { deviceId?: string | null }
  ) => Promise<OtpChallengeResponse>;
  email: string;
  purpose: OtpPurpose;
  fingerprint: Fingerprint;
}): Promise<OtpChallengeResponse> {
  return args.requestOtpFn(args.email, args.purpose, {
    deviceId: args.fingerprint?.deviceId ?? null,
  });
}
