export type SignInValidationOk = {
  ok: true;
  email: string;
  password: string;
};

export type SignInValidationError = {
  ok: false;
  title: string;
  message: string;
};

export type SignInValidationResult = SignInValidationOk | SignInValidationError;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export function validateSignInForm(input: {
  email: string;
  password: string;
}): SignInValidationResult {
  const email = (input.email ?? '').trim();
  const password = input.password ?? '';

  if (!email || !password || password.trim().length === 0) {
    return {
      ok: false,
      title: 'Missing Information',
      message: 'Please enter both email and password.',
    };
  }

  if (!emailPattern.test(email)) {
    return {
      ok: false,
      title: 'Invalid Email',
      message: 'Please enter a valid email address.',
    };
  }

  return { ok: true, email, password };
}
