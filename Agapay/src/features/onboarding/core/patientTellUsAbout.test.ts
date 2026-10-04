import {
  shouldSuppressStoreFallbackOnAddressPick,
  validatePatientTellUsAboutForm,
} from '@/src/features/onboarding/core/patientTellUsAbout';

describe('validatePatientTellUsAboutForm', () => {
  it('returns missing-fields modal message with correct list formatting', () => {
    expect(
      validatePatientTellUsAboutForm({ address: '', occupation: '', activityLevel: '' }),
    ).toEqual({
      ok: false,
      title: 'Missing Information',
      message: 'Please fill in Address, Occupation, and Activity Level.',
      missingFields: ['Address', 'Occupation', 'Activity Level'],
    });

    expect(
      validatePatientTellUsAboutForm({ address: 'x', occupation: '', activityLevel: '' }).ok,
    ).toBe(false);

    const out = validatePatientTellUsAboutForm({ address: 'x', occupation: '  ', activityLevel: 'sedentary' });
    expect(out.ok).toBe(false);
  });

  it('accepts valid inputs and trims occupation only', () => {
    const out = validatePatientTellUsAboutForm({
      address: '  123 Main  ',
      occupation: '  Student  ',
      activityLevel: 'moderate',
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.address).toBe('  123 Main  ');
      expect(out.occupation).toBe('Student');
      expect(out.activityLevel).toBe('moderate');
    }
  });
});

describe('shouldSuppressStoreFallbackOnAddressPick', () => {
  it('is true only when all inputs are falsy', () => {
    expect(
      shouldSuppressStoreFallbackOnAddressPick({
        address: '',
        latitude: '',
        longitude: '',
        barangayId: null,
        barangayName: '',
        locationDisplayName: '',
      }),
    ).toBe(true);

    expect(
      shouldSuppressStoreFallbackOnAddressPick({
        address: 'x',
        latitude: '',
        longitude: '',
        barangayId: null,
        barangayName: '',
        locationDisplayName: '',
      }),
    ).toBe(false);
  });
});
