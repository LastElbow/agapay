import {
  buildDayOptionsForWeek,
  discretizeAvailabilityForWeek,
  normalizeDayOfWeek,
} from '@/src/features/scheduling/core/slotting';

describe('scheduling/slotting', () => {
  it('normalizeDayOfWeek accepts numeric, numeric strings, and enum-like day names', () => {
    expect(normalizeDayOfWeek(1 as any)).toBe(1);
    expect(normalizeDayOfWeek('1' as any)).toBe(1);
    expect(normalizeDayOfWeek('DayOfWeek.Monday' as any)).toBe(1);
    expect(normalizeDayOfWeek('monday' as any)).toBe(1);
    expect(normalizeDayOfWeek('' as any)).toBeNull();
    expect(normalizeDayOfWeek('nope' as any)).toBeNull();
    expect(normalizeDayOfWeek(99 as any)).toBeNull();
    expect(normalizeDayOfWeek(-1 as any)).toBeNull();
  });

  it('discretizes into full 60-min slots only', () => {
    const now = new Date(2025, 2, 19, 10, 0, 0);
    const map = discretizeAvailabilityForWeek({
      now,
      weekOffset: 0,
      availabilityBlocks: [
        { dayOfWeek: 1, startTime: '09:00:00', endTime: '10:59:00', isAvailable: true } as any,
      ],
    });

    expect(map[1]).toEqual([
      { start: '09:00', end: '10:00' },
    ]);
  });

  it('supports custom slot durations (e.g. 30 minutes)', () => {
    const now = new Date(2025, 2, 19, 10, 0, 0);
    const map = discretizeAvailabilityForWeek({
      now,
      weekOffset: 0,
      slotDurationMinutes: 30,
      availabilityBlocks: [
        { dayOfWeek: 1, startTime: '09:00:00', endTime: '10:00:00', isAvailable: true } as any,
      ],
    });

    expect(map[1]).toEqual([
      { start: '09:00', end: '09:30' },
      { start: '09:30', end: '10:00' },
    ]);
  });

  it('specific-date blocks within week override recurring blocks for that DOW', () => {
    const now = new Date(2025, 2, 19, 10, 0, 0);

    const map = discretizeAvailabilityForWeek({
      now,
      weekOffset: 0,
      availabilityBlocks: [
        // recurring Monday 09-11
        { dayOfWeek: 1, startTime: '09:00:00', endTime: '11:00:00', isAvailable: true } as any,
        // specific-date Monday within this week (2025-03-17) 13-15
        {
          dayOfWeek: 1,
          startTime: '13:00:00',
          endTime: '15:00:00',
          isAvailable: true,
          specificDate: '2025-03-17',
        } as any,
      ],
    });

    // JS dow for Monday is 1
    expect(map[1]).toEqual([
      { start: '13:00', end: '14:00' },
      { start: '14:00', end: '15:00' },
    ]);
  });

  it('does not let out-of-week specific-date blocks override recurring blocks', () => {
    const now = new Date(2025, 2, 19, 10, 0, 0);

    const map = discretizeAvailabilityForWeek({
      now,
      weekOffset: 0,
      availabilityBlocks: [
        // recurring Monday 09-11
        { dayOfWeek: 1, startTime: '09:00:00', endTime: '11:00:00', isAvailable: true } as any,
        // specific-date Monday outside this week should be ignored
        {
          dayOfWeek: 1,
          startTime: '13:00:00',
          endTime: '15:00:00',
          isAvailable: true,
          specificDate: '2025-03-31',
        } as any,
      ],
    });

    expect(map[1]).toEqual([
      { start: '09:00', end: '10:00' },
      { start: '10:00', end: '11:00' },
    ]);
  });

  it('can exclude recurring blocks entirely when includeRecurringWhenNoSpecificDate is false', () => {
    const now = new Date(2025, 2, 19, 10, 0, 0);

    const map = discretizeAvailabilityForWeek({
      now,
      weekOffset: 0,
      includeRecurringWhenNoSpecificDate: false,
      availabilityBlocks: [
        { dayOfWeek: 1, startTime: '09:00:00', endTime: '11:00:00', isAvailable: true } as any,
      ],
    });

    expect(map).toEqual({});
  });

  it('buildDayOptionsForWeek sorts Sunday last and sets isPast for this week', () => {
    const now = new Date(2025, 2, 19, 10, 0, 0); // Wed

    const discretized = {
      0: [{ start: '09:00', end: '10:00' }],
      1: [{ start: '09:00', end: '10:00' }],
      2: [{ start: '09:00', end: '10:00' }],
    };

    const options = buildDayOptionsForWeek({
      discretizedAvailability: discretized as any,
      now,
      weekOffset: 0,
      dowToDayLabel: (dow) =>
        ({ 0: 'Sunday', 1: 'Monday', 2: 'Tuesday' } as any)[dow] ?? null,
    });

    expect(options.map((o) => o.dow)).toEqual([1, 2, 0]);

    const monday = options.find((o) => o.dow === 1)!;
    // Monday of this week is before Wed, so it's in the past
    expect(monday.isPast).toBe(true);

    const sunday = options.find((o) => o.dow === 0)!;
    // Sunday of this week is after Wed, so not past
    expect(sunday.isPast).toBe(false);
  });
});
