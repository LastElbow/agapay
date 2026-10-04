export type AuthRole = 'Patient' | 'PhysicalTherapist';

export type Fingerprint = {
  deviceId?: string | null;
  deviceName?: string | null;
};

export type ApiPost = (
  url: string,
  body?: unknown,
) => Promise<{ data?: any }>; // axios-like

export type AuthResponse = {
  accessToken?: string | null;
  refreshToken?: string | null;
  user?: any;
  requiresOtp?: boolean;
};

export type OtpChallengeResponse = {
  requiresOtp: boolean;
  email: string;
  purpose: 'AccountVerification' | 'TwoFactorLogin' | 'PasswordReset';
  expiresAtUtc?: string;
  message?: string;
  roleHint?: string | null;
};

export function computeRolesToTry(selectedRole: AuthRole | null | undefined): AuthRole[] {
  const roles: AuthRole[] = [];
  if (selectedRole) roles.push(selectedRole);
  if (!roles.includes('Patient')) roles.push('Patient');
  if (!roles.includes('PhysicalTherapist')) roles.push('PhysicalTherapist');
  return roles;
}

export function getLoginEndpoint(role: AuthRole): string {
  return role === 'Patient' ? '/api/Auth/login/patient' : '/api/Auth/login/therapist';
}

export function getRegisterEndpoint(role: AuthRole): string {
  return role === 'Patient' ? '/api/Auth/register/patient' : '/api/Auth/register';
}

export function getSignupRequestOtpEndpoint(): string {
  return '/api/Auth/signup/request-otp';
}

export function getSignupCompleteEndpoint(): string {
  return '/api/Auth/signup/complete';
}

type SignInDirect = { kind: 'direct'; role: AuthRole; response: AuthResponse };

type SignInOtp = {
  kind: 'otp';
  role: AuthRole;
  challenge: OtpChallengeResponse;
};

type SignInError = {
  kind: 'error';
  status: number | null;
  error: any;
};

export type SignInResult = SignInDirect | SignInOtp | SignInError;

export async function signInWithRoleFallback(args: {
  post: ApiPost;
  email: string;
  password: string;
  selectedRole?: AuthRole | null;
  fingerprint?: Fingerprint | null;
}): Promise<SignInResult> {
  const { post, email, password, selectedRole, fingerprint } = args;
  const rolesToTry = computeRolesToTry(selectedRole);

  let lastError: any = null;

  for (const role of rolesToTry) {
    const endpoint = getLoginEndpoint(role);
    try {
      const res = await post(endpoint, {
        email: email.trim(),
        password,
        deviceId: fingerprint?.deviceId ?? undefined,
        deviceName: fingerprint?.deviceName ?? undefined,
      });
      const data = res?.data ?? {};

      if (data?.accessToken) {
        return { kind: 'direct', role, response: data as AuthResponse };
      }

      if (data?.requiresOtp) {
        return {
          kind: 'otp',
          role,
          challenge: data as OtpChallengeResponse,
        };
      }

      // If server returns a non-error but also no auth payload, treat as error.
      lastError = new Error('Unexpected login response');
    } catch (err: any) {
      lastError = err;
      const status = err?.response?.status;
      if (status === 403) {
        // Role mismatch: try next role.
        continue;
      }
      return { kind: 'error', status: typeof status === 'number' ? status : null, error: err };
    }
  }

  const status = lastError?.response?.status;
  return { kind: 'error', status: typeof status === 'number' ? status : null, error: lastError };
}

export type RegisterResult =
  | { kind: 'otp'; role: AuthRole; challenge: OtpChallengeResponse }
  | { kind: 'direct'; role: AuthRole; response: AuthResponse };

export async function registerAccount(args: {
  post: ApiPost;
  role: AuthRole;
  payload: Record<string, unknown>;
}): Promise<RegisterResult> {
  const { post, role, payload } = args;
  const endpoint = getRegisterEndpoint(role);
  const res = await post(endpoint, payload);
  const data = res?.data ?? {};

  if (data?.requiresOtp) {
    return { kind: 'otp', role, challenge: data as OtpChallengeResponse };
  }

  if (data?.accessToken) {
    return { kind: 'direct', role, response: data as AuthResponse };
  }

  throw new Error('Unexpected registration response from server.');
}

export async function requestSignupOtp(args: {
  post: ApiPost;
  email: string;
}): Promise<OtpChallengeResponse> {
  const { post, email } = args;
  const res = await post(getSignupRequestOtpEndpoint(), { email: email.trim() });
  const data = res?.data ?? {};
  if (data?.requiresOtp) {
    return data as OtpChallengeResponse;
  }
  throw new Error('Unexpected signup OTP response from server.');
}

export type CompleteSignupPayload = {
  email: string;
  code: string;
  role: AuthRole;
  firstName: string;
  lastName: string;
  password: string;
  dateOfBirth: string;
  gender?: string | null;
  licenseNumber?: string | null;
  workPhoneNumber?: string | null;
};

export async function completeSignup(args: {
  post: ApiPost;
  payload: CompleteSignupPayload;
}): Promise<AuthResponse> {
  const { post, payload } = args;
  const res = await post(getSignupCompleteEndpoint(), {
    email: payload.email.trim(),
    code: payload.code.trim(),
    role: payload.role,
    firstName: payload.firstName,
    lastName: payload.lastName,
    password: payload.password,
    dateOfBirth: payload.dateOfBirth,
    gender: payload.gender ?? undefined,
    licenseNumber: payload.licenseNumber ?? undefined,
    workPhoneNumber: payload.workPhoneNumber ?? undefined,
  });
  const data = res?.data ?? {};
  if (data?.accessToken) {
    return data as AuthResponse;
  }
  throw new Error('Unexpected signup completion response from server.');
}

export async function requestPasswordResetLink(args: {
  post: ApiPost;
  email: string;
}): Promise<{ accepted: true; devToken?: string; resetUrl?: string }>
{
  const { post, email } = args;
  try {
    const res = await post('/api/Auth/forgot-password', { email: email.trim() });
    const data = res?.data ?? {};
    return { accepted: true, devToken: data.devToken, resetUrl: data.resetUrl };
  } catch {
    // Anti-enumeration: treat as accepted even on errors.
    return { accepted: true };
  }
}

export async function submitPasswordReset(args: {
  post: ApiPost;
  email: string;
  token: string;
  newPassword: string;
}): Promise<{ accepted: true }> {
  const { post, email, token, newPassword } = args;
  try {
    await post('/api/Auth/reset-password', {
      email: email.trim(),
      token: token.trim(),
      newPassword,
    });
    return { accepted: true };
  } catch {
    // Anti-bruteforce signaling: treat as accepted even on errors.
    return { accepted: true };
  }
}
