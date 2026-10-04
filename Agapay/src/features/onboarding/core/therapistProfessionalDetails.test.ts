import { validateTherapistProfessionalDetailsStep } from '@/src/features/onboarding/core/therapistProfessionalDetails';

describe('validateTherapistProfessionalDetailsStep', () => {
  it('requires at least one specialization', () => {
    expect(
      validateTherapistProfessionalDetailsStep({ specializationIds: [], feeText: '100' }),
    ).toEqual({ ok: false, error: 'Please select at least one specialization.' });
  });

  it('requires fee and validates > 0', () => {
    expect(
      validateTherapistProfessionalDetailsStep({ specializationIds: [1], feeText: '' }),
    ).toEqual({ ok: false, error: 'Please enter your professional fee per session.' });

    expect(
      validateTherapistProfessionalDetailsStep({ specializationIds: [1], feeText: '0' }),
    ).toEqual({ ok: false, error: 'Please enter a valid fee greater than 0.' });

    expect(
      validateTherapistProfessionalDetailsStep({ specializationIds: [1], feeText: 'abc' }),
    ).toEqual({ ok: false, error: 'Please enter a valid fee greater than 0.' });
  });

  it('accepts valid fee and returns parsed number', () => {
    const out = validateTherapistProfessionalDetailsStep({
      specializationIds: [2, 2, 3],
      feeText: '1500.50',
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.specializationIds).toEqual([2, 3]);
      expect(out.feePerSession).toBe(1500.5);
    }
  });
});
