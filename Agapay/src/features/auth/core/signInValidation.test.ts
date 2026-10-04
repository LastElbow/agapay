import { validateSignInForm } from '@/src/features/auth/core/signInValidation';

describe('validateSignInForm', () => {
  it('rejects missing fields', () => {
    expect(validateSignInForm({ email: '', password: '' })).toEqual({
      ok: false,
      title: 'Missing Information',
      message: 'Please enter both email and password.',
    });
    expect(validateSignInForm({ email: 'a@b.com', password: '' }).ok).toBe(false);
    expect(validateSignInForm({ email: '', password: 'pw' }).ok).toBe(false);
  });

  it('treats whitespace-only password as missing', () => {
    const out = validateSignInForm({ email: 'user@example.com', password: '   ' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.title).toBe('Missing Information');
  });

  it('rejects invalid email', () => {
    const out = validateSignInForm({ email: 'not-an-email', password: 'pw' });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.title).toBe('Invalid Email');
    }
  });

  it('trims and accepts valid credentials', () => {
    const out = validateSignInForm({ email: '  user@example.com  ', password: 'pw' });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.email).toBe('user@example.com');
      expect(out.password).toBe('pw');
    }
  });
});
