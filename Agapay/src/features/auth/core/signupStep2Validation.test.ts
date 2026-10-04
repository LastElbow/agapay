import {
  getPasswordRequirements,
  isPasswordStrong,
  validateTherapistLicenseNumber,
  validateSignupStep2Form,
} from '@/src/features/auth/core/signupStep2Validation';

describe('signupStep2Validation', () => {
  it('computes password requirements', () => {
    const reqs = getPasswordRequirements('Abcdef1!');
    expect(reqs).toHaveLength(5);
    expect(reqs.every((r) => r.valid)).toBe(true);
  });

  it('detects weak password', () => {
    expect(isPasswordStrong('short')).toBe(false);
    expect(isPasswordStrong('Abcdef1!')).toBe(true);
  });

  it('rejects missing fields with friendly list', () => {
    const out = validateSignupStep2Form({
      email: '',
      password: '',
      confirmPassword: '',
      agree: false,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.title).toBe('Missing Information');
      expect(out.message).toContain('Email Address');
      expect(out.message).toContain('Password');
      expect(out.message).toContain('Confirm Password');
    }
  });

  it('formats single missing field message', () => {
    const out = validateSignupStep2Form({
      email: '',
      password: 'Abcdef1!',
      confirmPassword: 'Abcdef1!',
      agree: true,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toBe('Please fill in Email Address.');
  });

  it('formats two missing fields message', () => {
    const out = validateSignupStep2Form({
      email: '',
      password: '',
      confirmPassword: 'Abcdef1!',
      agree: true,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.message).toBe('Please fill in Email Address and Password.');
    }
  });

  it('treats whitespace-only password as missing', () => {
    const out = validateSignupStep2Form({
      email: 'user@example.com',
      password: '   ',
      confirmPassword: '   ',
      agree: true,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.title).toBe('Missing Information');
  });

  it('rejects invalid email', () => {
    const out = validateSignupStep2Form({
      email: 'bad',
      password: 'Abcdef1!',
      confirmPassword: 'Abcdef1!',
      agree: true,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.title).toBe('Invalid Email');
  });

  it('rejects password mismatch', () => {
    const out = validateSignupStep2Form({
      email: 'user@example.com',
      password: 'Abcdef1!',
      confirmPassword: 'Abcdef1@',
      agree: true,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.title).toBe('Password Mismatch');
  });

  it('rejects when terms not accepted', () => {
    const out = validateSignupStep2Form({
      email: 'user@example.com',
      password: 'Abcdef1!',
      confirmPassword: 'Abcdef1!',
      agree: false,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.title).toBe('Terms Required');
  });

  it('returns trimmed email on success', () => {
    const out = validateSignupStep2Form({
      email: '  user@example.com  ',
      password: 'Abcdef1!',
      confirmPassword: 'Abcdef1!',
      agree: true,
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.email).toBe('user@example.com');
  });

  it('requires therapist license number', () => {
    const out = validateTherapistLicenseNumber('');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.title).toBe('Missing Information');
  });

  it('accepts a valid therapist license number', () => {
    const out = validateTherapistLicenseNumber('  PT-1234 ');
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.licenseNumber).toBe('PT-1234');
  });
});
