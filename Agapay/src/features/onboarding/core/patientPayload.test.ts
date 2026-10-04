import { buildPatientOnboardingPayloadForMyself } from '@/src/features/onboarding/core/patientPayload';

describe('buildPatientOnboardingPayloadForMyself', () => {
  it('builds payload with null fallbacks and trims complaints', () => {
    const out = buildPatientOnboardingPayloadForMyself({
      authUser: {
        firstName: 'A',
        lastName: 'B',
        dateOfBirth: '2000-01-01',
        gender: 'Male',
      },
      params: {
        address: 'Addr',
        latitude: '1',
        longitude: '2',
        locationDisplayName: 'Loc',
        occupation: 'Dev',
        activityLevel: 'light',
      },
      currentComplaints: '  pain  ',
    });

    expect(out).toEqual({
      onboardingType: 'ForMyself',
      firstName: 'A',
      lastName: 'B',
      dateOfBirth: '2000-01-01',
      relationshipToUser: 'myself',
      address: 'Addr',
      latitude: 1,
      longitude: 2,
      locationDisplayName: 'Loc',
      occupation: 'Dev',
      currentComplaints: 'pain',
      activityLevel: 'light',
      gender: 'Male',
    });
  });

  it('sets complaints to null when whitespace-only', () => {
    const out = buildPatientOnboardingPayloadForMyself({
      authUser: null,
      params: null,
      currentComplaints: '   ',
    });

    expect(out.currentComplaints).toBeNull();
    expect(out.firstName).toBeNull();
    expect(out.address).toBeNull();
  });
});
