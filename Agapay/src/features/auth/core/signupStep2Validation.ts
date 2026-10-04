export type PasswordRequirement = {
  id: number;
  label: string;
  valid: boolean;
};

export function getPasswordRequirements(password: string): PasswordRequirement[] {
  const value = password ?? '';
  return [
    { id: 1, label: 'At least 8 characters', valid: value.length >= 8 },
    { id: 2, label: 'One uppercase letter', valid: /[A-Z]/.test(value) },
    { id: 3, label: 'One lowercase letter', valid: /[a-z]/.test(value) },
    { id: 4, label: 'One number', valid: /[0-9]/.test(value) },
    {
      id: 5,
      label: 'One special character',
      valid: /[!@#$%^&*(),.?\":{}|<>]/.test(value),
    },
  ];
}

export function isPasswordStrong(password: string): boolean {
  return getPasswordRequirements(password).every((req) => req.valid);
}

export type SignupStep2ValidationOk = {
  ok: true;
  email: string;
  password: string;
  confirmPassword: string;
};

export type SignupStep2ValidationError = {
  ok: false;
  title: string;
  message: string;
};

export type SignupStep2ValidationResult =
  | SignupStep2ValidationOk
  | SignupStep2ValidationError;

export type LicenseValidationOk = { ok: true; licenseNumber: string };
export type LicenseValidationError = {
  ok: false;
  title: string;
  message: string;
};
export type LicenseValidationResult = LicenseValidationOk | LicenseValidationError;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

function formatMissingFields(fields: string[]): string {
  if (fields.length === 0) return '';
  if (fields.length === 1) return fields[0];
  if (fields.length === 2) return `${fields[0]} and ${fields[1]}`;
  return `${fields.slice(0, -1).join(', ')}, and ${fields[fields.length - 1]}`;
}

export function validateSignupStep2Form(input: {
  email: string;
  password: string;
  confirmPassword: string;
  agree: boolean;
}): SignupStep2ValidationResult {
  const email = (input.email ?? '').trim();
  const password = input.password ?? '';
  const confirmPassword = input.confirmPassword ?? '';
  const agree = Boolean(input.agree);

  const missingFields: string[] = [];
  if (!email) missingFields.push('Email Address');
  if (!password || password.trim().length === 0) missingFields.push('Password');
  if (!confirmPassword || confirmPassword.trim().length === 0)
    missingFields.push('Confirm Password');

  if (missingFields.length > 0) {
    return {
      ok: false,
      title: 'Missing Information',
      message: `Please fill in ${formatMissingFields(missingFields)}.`,
    };
  }

  if (!emailPattern.test(email)) {
    return {
      ok: false,
      title: 'Invalid Email',
      message: 'Please enter a valid email address.',
    };
  }

  if (!isPasswordStrong(password)) {
    return {
      ok: false,
      title: 'Weak Password',
      message: 'Please ensure your password meets all the requirements.',
    };
  }

  if (password !== confirmPassword) {
    return {
      ok: false,
      title: 'Password Mismatch',
      message: "The passwords you entered don't match. Please try again.",
    };
  }

  if (!agree) {
    return {
      ok: false,
      title: 'Terms Required',
      message: 'Please accept the Terms and Conditions to create your account.',
    };
  }

  return { ok: true, email, password, confirmPassword };
}

export function validateTherapistLicenseNumber(
  licenseNumber: string,
): LicenseValidationResult {
  const value = (licenseNumber ?? '').trim();
  if (!value) {
    return {
      ok: false,
      title: 'Missing Information',
      message: 'Please enter your license number.',
    };
  }

  if (value.length < 4) {
    return {
      ok: false,
      title: 'Invalid License Number',
      message: 'Please enter a valid license number.',
    };
  }

  return { ok: true, licenseNumber: value };
}
