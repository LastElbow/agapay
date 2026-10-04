import {
  clearSignupDraft,
  getSignupDraft,
  setSignupDraft,
} from '@/src/features/auth/core/signupDraftStore';

describe('signupDraftStore', () => {
  afterEach(() => {
    clearSignupDraft();
  });

  it('stores and retrieves a draft', () => {
    setSignupDraft({
      role: 'Patient',
      email: '  user@example.com  ',
      password: 'pw',
      firstName: 'A',
      lastName: 'B',
      dateOfBirth: '1990-01-01',
      gender: null,
    });

    const out = getSignupDraft();
    expect(out?.email).toBe('user@example.com');
    expect(out?.role).toBe('Patient');
  });

  it('returns null when email does not match', () => {
    setSignupDraft({
      role: 'Patient',
      email: 'user@example.com',
      password: 'pw',
      firstName: 'A',
      lastName: 'B',
      dateOfBirth: '1990-01-01',
      gender: null,
    });

    expect(getSignupDraft('other@example.com')).toBeNull();
    expect(getSignupDraft('USER@example.com')).not.toBeNull();
  });
});
