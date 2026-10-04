import { formatMissingFieldsList } from '@/src/features/onboarding/core/missingFields';

describe('formatMissingFieldsList', () => {
  it('formats 0/1/2/3+ items with correct grammar', () => {
    expect(formatMissingFieldsList([])).toBe('');
    expect(formatMissingFieldsList(['Address'])).toBe('Address');
    expect(formatMissingFieldsList(['Address', 'Occupation'])).toBe('Address and Occupation');
    expect(formatMissingFieldsList(['Address', 'Occupation', 'Activity Level'])).toBe(
      'Address, Occupation, and Activity Level',
    );
  });

  it('trims and skips empty items', () => {
    expect(formatMissingFieldsList(['  Address  ', '', '  '])).toBe('Address');
  });
});
