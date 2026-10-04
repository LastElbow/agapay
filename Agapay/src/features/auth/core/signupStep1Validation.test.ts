import {
  formatDate,
  formatMissingFieldsList,
  validateSignupStep1,
} from '@/src/features/auth/core/signupStep1Validation';

describe('signupStep1Validation', () => {
  it('formatDate uses YYYY-MM-DD', () => {
    expect(formatDate(new Date(2020, 0, 2))).toBe('2020-01-02');
  });

  it('formatMissingFieldsList matches UI grammar', () => {
    expect(formatMissingFieldsList(['A'])).toBe('A');
    expect(formatMissingFieldsList(['A', 'B'])).toBe('A and B');
    expect(formatMissingFieldsList(['A', 'B', 'C'])).toBe('A, B, and C');
  });

  it('reports missing fields with correct message', () => {
    const res = validateSignupStep1({
      firstName: '',
      lastName: 'L',
      dobDate: null,
      gender: null,
      now: new Date(2026, 2, 17),
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.title).toBe('Missing Information');
      expect(res.message).toBe('Please fill in First Name, Date of Birth, and Gender.');
    }
  });

  it('rejects future birth year', () => {
    const res = validateSignupStep1({
      firstName: 'F',
      lastName: 'L',
      dobDate: new Date(2030, 0, 1),
      gender: 'M',
      now: new Date(2026, 2, 17),
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toBe('Date of birth cannot be in the future.');
  });

  it('rejects too-old birth year (>120 years)', () => {
    const res = validateSignupStep1({
      firstName: 'F',
      lastName: 'L',
      dobDate: new Date(1800, 0, 1),
      gender: 'M',
      now: new Date(2026, 2, 17),
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toBe('Please enter a valid year of birth.');
  });

  it('rejects users under 13', () => {
    const res = validateSignupStep1({
      firstName: 'F',
      lastName: 'L',
      dobDate: new Date(2015, 5, 1),
      gender: 'M',
      now: new Date(2026, 2, 17),
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toBe('You must be at least 13 years old to create an account.');
  });

  it('returns params for a valid input', () => {
    const res = validateSignupStep1({
      firstName: 'F',
      lastName: 'L',
      dobDate: new Date(2000, 0, 1),
      gender: 'Female',
      now: new Date(2026, 2, 17),
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.params).toEqual({
        firstName: 'F',
        lastName: 'L',
        dateOfBirth: '2000-01-01',
        gender: 'Female',
      });
    }
  });
});
