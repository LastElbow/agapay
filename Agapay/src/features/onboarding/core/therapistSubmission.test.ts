import {
  buildTherapistOnboardingMultipartParts,
  joinBaseUrl,
  validateTherapistServiceAreasStep,
} from '@/src/features/onboarding/core/therapistSubmission';

describe('validateTherapistServiceAreasStep', () => {
  it('requires at least one service area', () => {
    expect(validateTherapistServiceAreasStep([])).toEqual({
      ok: false,
      error: 'Please select at least one service area.',
    });
  });

  it('normalizes to unique ids', () => {
    const out = validateTherapistServiceAreasStep([1, 1, 2]);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.serviceAreaIds).toEqual([1, 2]);
  });
});

describe('joinBaseUrl', () => {
  it('joins baseUrl and path without double slashes', () => {
    expect(joinBaseUrl('', '/api/x')).toBe('/api/x');
    expect(joinBaseUrl('https://example.com', '/api/x')).toBe('https://example.com/api/x');
    expect(joinBaseUrl('https://example.com/', '/api/x')).toBe('https://example.com/api/x');
  });
});

describe('buildTherapistOnboardingMultipartParts', () => {
  it('builds repeated fields and prefers otherConditions list over legacy otherCondition', () => {
    const out = buildTherapistOnboardingMultipartParts({
      feePerSession: 1234,
      specializationIds: [1, 2],
      conditionIds: [5],
      otherConditions: ['  A  ', ''],
      otherCondition: 'LEGACY',
      serviceAreaIds: [9],
      profilePicture: 'file:///path/to/photo.png',
    });

    expect(out.fields).toEqual([
      { name: 'FeePerSession', value: '1234' },
      { name: 'SpecializationIds', value: '1' },
      { name: 'SpecializationIds', value: '2' },
      { name: 'ConditionIds', value: '5' },
      { name: 'OtherConditionsList', value: 'A' },
      { name: 'ServiceAreasIds', value: '9' },
    ]);

    expect(out.file).toEqual({
      uri: 'file:///path/to/photo.png',
      name: 'photo.png',
      type: 'image/png',
    });
  });

  it('falls back to legacy OtherCondition when otherConditions is empty', () => {
    const out = buildTherapistOnboardingMultipartParts({
      otherConditions: [],
      otherCondition: '  Legacy  ',
    });

    expect(out.fields).toEqual([{ name: 'OtherCondition', value: 'Legacy' }]);
  });

  it('defaults profile mime type to jpeg for non-png', () => {
    const out = buildTherapistOnboardingMultipartParts({
      profilePicture: 'file:///x/photo.jpg',
    });

    expect(out.file?.type).toBe('image/jpeg');
  });
});
