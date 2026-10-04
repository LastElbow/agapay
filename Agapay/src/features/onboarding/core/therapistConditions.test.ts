import {
  normalizeOtherConditionsList,
  validateTherapistConditionsStep,
} from '@/src/features/onboarding/core/therapistConditions';

describe('normalizeOtherConditionsList', () => {
  it('trims, drops empties, and de-dupes case-insensitively', () => {
    expect(normalizeOtherConditionsList(['  A ', 'a', 'B', '', '  '])).toEqual(['A', 'B']);
  });
});

describe('validateTherapistConditionsStep', () => {
  it('requires at least one condition id or other condition', () => {
    const out = validateTherapistConditionsStep({ conditionIds: [], otherConditions: [] });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe('Please select or enter at least one condition.');
  });

  it('accepts when conditionIds present', () => {
    const out = validateTherapistConditionsStep({ conditionIds: [1, 1], otherConditions: [] });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.conditionIds).toEqual([1]);
      expect(out.otherConditions).toEqual([]);
    }
  });

  it('accepts when otherConditions present', () => {
    const out = validateTherapistConditionsStep({ conditionIds: [], otherConditions: ['  X  '] });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.otherConditions).toEqual(['X']);
    }
  });
});
