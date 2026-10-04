import {
  allowRememberDeviceForPurpose,
  buildVerifyOtpPayload,
  canResendOtp,
  getParam,
  normalizeRememberDevice,
  parsePurpose,
  parseRoleHint,
  resendOtpCode,
  verifyOtpCode,
} from '@/src/features/auth/core/otpFlow';

import type { OtpChallengeResponse, VerifyOtpPayload } from '@/api/client';

describe('otpFlow', () => {
  it('getParam returns the first entry for array params', () => {
    expect(getParam(undefined)).toBeUndefined();
    expect(getParam('x')).toBe('x');
    expect(getParam(['a', 'b'])).toBe('a');
  });

  it('parseRoleHint accepts only Patient/PhysicalTherapist', () => {
    expect(parseRoleHint(undefined)).toBeNull();
    expect(parseRoleHint('Patient')).toBe('Patient');
    expect(parseRoleHint('PhysicalTherapist')).toBe('PhysicalTherapist');
    expect(parseRoleHint('Other')).toBeNull();
  });

  it('parsePurpose defaults to AccountVerification', () => {
    expect(parsePurpose(undefined)).toBe('AccountVerification');
    expect(parsePurpose('TwoFactorLogin')).toBe('TwoFactorLogin');
    expect(parsePurpose('PasswordReset')).toBe('PasswordReset');
    expect(parsePurpose('Nope')).toBe('AccountVerification');
  });

  it('enforces remember-device off for PasswordReset', () => {
    expect(allowRememberDeviceForPurpose('TwoFactorLogin')).toBe(true);
    expect(allowRememberDeviceForPurpose('AccountVerification')).toBe(true);
    expect(allowRememberDeviceForPurpose('PasswordReset')).toBe(false);

    expect(normalizeRememberDevice('PasswordReset', true)).toBe(false);
    expect(normalizeRememberDevice('TwoFactorLogin', true)).toBe(true);
  });

  it('canResendOtp matches UI rules', () => {
    expect(canResendOtp({ isResending: true, remainingSeconds: 0, email: 'a' })).toBe(false);
    expect(canResendOtp({ isResending: false, remainingSeconds: 10, email: 'a' })).toBe(false);
    expect(canResendOtp({ isResending: false, remainingSeconds: 0, email: '' })).toBe(false);
    expect(canResendOtp({ isResending: false, remainingSeconds: 0, email: 'a' })).toBe(true);
  });

  it('buildVerifyOtpPayload includes fingerprint and normalizes rememberDevice', () => {
    const payload = buildVerifyOtpPayload({
      email: 'e',
      code: '1234',
      purpose: 'PasswordReset',
      fingerprint: { deviceId: 'd', deviceName: 'n' },
      rememberDevice: true,
    });

    expect(payload).toEqual({
      email: 'e',
      code: '1234',
      purpose: 'PasswordReset',
      deviceId: 'd',
      deviceName: 'n',
      rememberDevice: false,
    });
  });

  it('verifyOtpCode calls verifyOtpFn with the derived payload', async () => {
    const verifyOtpFn = jest.fn(async (p: VerifyOtpPayload) => ({ accessToken: 'a', user: { id: 1 } } as any));

    await verifyOtpCode({
      verifyOtpFn,
      email: 'e',
      code: '9999',
      purpose: 'TwoFactorLogin',
      fingerprint: null,
      rememberDevice: true,
    });

    expect(verifyOtpFn).toHaveBeenCalledWith({
      email: 'e',
      code: '9999',
      purpose: 'TwoFactorLogin',
      deviceId: undefined,
      deviceName: undefined,
      rememberDevice: true,
    });
  });

  it('resendOtpCode calls requestOtpFn with deviceId and returns challenge', async () => {
    const response: OtpChallengeResponse = {
      requiresOtp: true,
      email: 'e',
      purpose: 'AccountVerification',
      expiresAtUtc: '2025-01-01T00:00:00Z',
      message: 'sent',
    };

    const requestOtpFn = jest.fn(async () => response);

    const challenge = await resendOtpCode({
      requestOtpFn,
      email: 'e',
      purpose: 'AccountVerification',
      fingerprint: { deviceId: 'dev' },
    });

    expect(requestOtpFn).toHaveBeenCalledWith('e', 'AccountVerification', { deviceId: 'dev' });
    expect(challenge.message).toBe('sent');
  });
});
