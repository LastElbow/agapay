import { dowToDayLabel, dowToMondayOffset } from '@/src/features/scheduling/core/dow';

describe('scheduling/dow', () => {
  it('dowToDayLabel supports number, numeric string, and dotted enum-like strings', () => {
    expect(dowToDayLabel(1)).toBe('Monday');
    expect(dowToDayLabel('1')).toBe('Monday');
    expect(dowToDayLabel('DayOfWeek.Monday')).toBe('Monday');
    expect(dowToDayLabel('monday')).toBe('Monday');
    expect(dowToDayLabel('')).toBeNull();
    expect(dowToDayLabel('nope')).toBeNull();
  });

  it('dowToMondayOffset places Sunday last', () => {
    expect(dowToMondayOffset(1)).toBe(0); // Monday
    expect(dowToMondayOffset(2)).toBe(1); // Tuesday
    expect(dowToMondayOffset(0)).toBe(6); // Sunday
    expect(dowToMondayOffset(99)).toBeNull();
  });
});
