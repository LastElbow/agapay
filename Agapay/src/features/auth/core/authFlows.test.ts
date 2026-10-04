import {
  computeRolesToTry,
  completeSignup,
  getLoginEndpoint,
  getRegisterEndpoint,
  getSignupCompleteEndpoint,
  getSignupRequestOtpEndpoint,
  registerAccount,
  requestSignupOtp,
  requestPasswordResetLink,
  signInWithRoleFallback,
  submitPasswordReset,
  type ApiPost,
  type AuthRole,
} from '@/src/features/auth/core/authFlows';

describe('authFlows', () => {
  describe('computeRolesToTry', () => {
    it('prioritizes selectedRole then tries both roles', () => {
      expect(computeRolesToTry('Patient')).toEqual(['Patient', 'PhysicalTherapist']);
      expect(computeRolesToTry('PhysicalTherapist')).toEqual(['PhysicalTherapist', 'Patient']);
      expect(computeRolesToTry(null)).toEqual(['Patient', 'PhysicalTherapist']);
    });
  });

  describe('endpoints', () => {
    it('maps role to correct auth endpoints', () => {
      expect(getLoginEndpoint('Patient')).toBe('/api/Auth/login/patient');
      expect(getLoginEndpoint('PhysicalTherapist')).toBe('/api/Auth/login/therapist');
      expect(getRegisterEndpoint('Patient')).toBe('/api/Auth/register/patient');
      expect(getRegisterEndpoint('PhysicalTherapist')).toBe('/api/Auth/register');

      expect(getSignupRequestOtpEndpoint()).toBe('/api/Auth/signup/request-otp');
      expect(getSignupCompleteEndpoint()).toBe('/api/Auth/signup/complete');
    });
  });

  describe('otp-first signup', () => {
    it('requests signup OTP via dedicated endpoint', async () => {
      const post: ApiPost = jest.fn(async (url, body) => {
        expect(url).toBe('/api/Auth/signup/request-otp');
        expect(body).toEqual({ email: 'user@example.com' });
        return {
          data: {
            requiresOtp: true,
            email: 'user@example.com',
            purpose: 'AccountVerification',
            expiresAtUtc: '2026-01-01T00:00:00Z',
          },
        };
      });

      const out = await requestSignupOtp({ post, email: '  user@example.com  ' });
      expect(out.requiresOtp).toBe(true);
      expect(out.purpose).toBe('AccountVerification');
    });

    it('completes signup and returns tokens', async () => {
      const post: ApiPost = jest.fn(async (url, body) => {
        expect(url).toBe('/api/Auth/signup/complete');
        expect((body as any).email).toBe('user@example.com');
        expect((body as any).code).toBe('123456');
        expect((body as any).role).toBe('Patient');
        return { data: { accessToken: 'a', refreshToken: 'r', user: { email: 'user@example.com' } } };
      });

      const out = await completeSignup({
        post,
        payload: {
          email: ' user@example.com ',
          code: ' 123456 ',
          role: 'Patient',
          firstName: 'A',
          lastName: 'B',
          password: 'Test12345!',
          dateOfBirth: '1990-01-01',
          gender: null,
        },
      });
      expect(out.accessToken).toBe('a');
    });
  });

  describe('signInWithRoleFallback', () => {
    it('signs in directly for patient when accessToken is returned', async () => {
      const post: ApiPost = jest.fn(async (url) => {
        expect(url).toBe('/api/Auth/login/patient');
        return { data: { accessToken: 'a', refreshToken: 'r', user: { id: 1 } } };
      });

      const result = await signInWithRoleFallback({
        post,
        email: ' user@example.com ',
        password: 'pw',
        selectedRole: 'Patient',
      });

      expect(result.kind).toBe('direct');
      if (result.kind === 'direct') {
        expect(result.role).toBe('Patient');
        expect(result.response.accessToken).toBe('a');
      }
      expect((post as any).mock.calls).toHaveLength(1);
    });

    it('falls back from patient->therapist on 403 role mismatch', async () => {
      const post: ApiPost = jest.fn(async (url) => {
        if (url === '/api/Auth/login/patient') {
          const err: any = new Error('Forbidden');
          err.response = { status: 403 };
          throw err;
        }
        if (url === '/api/Auth/login/therapist') {
          return { data: { accessToken: 't', user: { id: 9 } } };
        }
        throw new Error('unexpected url');
      });

      const result = await signInWithRoleFallback({
        post,
        email: 'user@example.com',
        password: 'pw',
        selectedRole: 'Patient',
      });

      expect(result.kind).toBe('direct');
      if (result.kind === 'direct') {
        expect(result.role).toBe('PhysicalTherapist');
        expect(result.response.accessToken).toBe('t');
      }
      expect((post as any).mock.calls.map((c: any[]) => c[0])).toEqual([
        '/api/Auth/login/patient',
        '/api/Auth/login/therapist',
      ]);
    });

    it('returns otp challenge when server requiresOtp', async () => {
      const post: ApiPost = jest.fn(async () => ({
        data: {
          requiresOtp: true,
          email: 'user@example.com',
          purpose: 'TwoFactorLogin',
          expiresAtUtc: '2025-01-01T00:00:00Z',
        },
      }));

      const result = await signInWithRoleFallback({
        post,
        email: 'user@example.com',
        password: 'pw',
        selectedRole: 'Patient',
      });

      expect(result.kind).toBe('otp');
      if (result.kind === 'otp') {
        expect(result.role).toBe('Patient');
        expect(result.challenge.purpose).toBe('TwoFactorLogin');
      }
    });

    it('stops early and returns error for non-403 failures', async () => {
      const post: ApiPost = jest.fn(async () => {
        const err: any = new Error('Unauthorized');
        err.response = { status: 401 };
        throw err;
      });

      const result = await signInWithRoleFallback({
        post,
        email: 'user@example.com',
        password: 'pw',
        selectedRole: null,
      });

      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.status).toBe(401);
      }
      expect((post as any).mock.calls).toHaveLength(1);
    });

    it('returns error when both roles are forbidden', async () => {
      const post: ApiPost = jest.fn(async () => {
        const err: any = new Error('Forbidden');
        err.response = { status: 403 };
        throw err;
      });

      const result = await signInWithRoleFallback({
        post,
        email: 'user@example.com',
        password: 'pw',
        selectedRole: null,
      });

      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.status).toBe(403);
      }
      expect((post as any).mock.calls).toHaveLength(2);
    });
  });

  describe('registerAccount', () => {
    it('registers patient via dedicated endpoint', async () => {
      const post: ApiPost = jest.fn(async (url, body) => {
        expect(url).toBe('/api/Auth/register/patient');
        expect((body as any).email).toBe('user@example.com');
        return { data: { accessToken: 'a' } };
      });

      const result = await registerAccount({
        post,
        role: 'Patient',
        payload: { email: 'user@example.com' },
      });

      expect(result.kind).toBe('direct');
    });

    it('registers therapist via generic endpoint', async () => {
      const post: ApiPost = jest.fn(async (url) => {
        expect(url).toBe('/api/Auth/register');
        return { data: { requiresOtp: true, email: 't@x.com', purpose: 'AccountVerification' } };
      });

      const result = await registerAccount({
        post,
        role: 'PhysicalTherapist',
        payload: { email: 't@x.com', desiredRole: 'PhysicalTherapist' },
      });

      expect(result.kind).toBe('otp');
      if (result.kind === 'otp') {
        expect(result.role).toBe('PhysicalTherapist');
      }
    });
  });

  describe('password reset anti-enumeration', () => {
    const okPost: ApiPost = jest.fn(async () => ({ data: { devToken: 'x', resetUrl: 'u' } }));
    const badPost: ApiPost = jest.fn(async () => {
      throw new Error('network');
    });

    it('requestPasswordResetLink always resolves accepted=true and trims email', async () => {
      const outOk = await requestPasswordResetLink({ post: okPost, email: '  a@b.com  ' });
      expect(outOk.accepted).toBe(true);
      expect(okPost).toHaveBeenCalledWith('/api/Auth/forgot-password', { email: 'a@b.com' });

      const outBad = await requestPasswordResetLink({ post: badPost, email: 'a@b.com' });
      expect(outBad.accepted).toBe(true);
    });

    it('submitPasswordReset always resolves accepted=true and trims email/token', async () => {
      const outOk = await submitPasswordReset({
        post: okPost,
        email: '  a@b.com  ',
        token: '  tok  ',
        newPassword: 'pw',
      });
      expect(outOk.accepted).toBe(true);
      expect(okPost).toHaveBeenCalledWith('/api/Auth/reset-password', {
        email: 'a@b.com',
        token: 'tok',
        newPassword: 'pw',
      });

      const outBad = await submitPasswordReset({
        post: badPost,
        email: 'a@b.com',
        token: 'tok',
        newPassword: 'pw',
      });
      expect(outBad.accepted).toBe(true);
    });
  });

  // Ensures the role union stays stable (guards against accidental string drift)
  it('AuthRole type examples compile', () => {
    const r1: AuthRole = 'Patient';
    const r2: AuthRole = 'PhysicalTherapist';
    expect(r1).toBe('Patient');
    expect(r2).toBe('PhysicalTherapist');
  });
});
