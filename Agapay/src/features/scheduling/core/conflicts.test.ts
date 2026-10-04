import { buildConflictKeySet } from '@/src/features/scheduling/core/conflicts';

describe('scheduling/conflicts', () => {
  it('builds conflict keys from recurring commitments and booked intervals', () => {
    const keys = buildConflictKeySet({
      recurringCommitments: [
        { dayOfWeek: 2, startTime: '09:00:00' } as any,
      ],
      bookedIntervals: [
        { startAt: '2025-03-19T09:00:00' } as any,
      ],
    });

    // recurring commitment uses its own dayOfWeek
    expect(keys.has('2-09:00')).toBe(true);

    // booked interval uses startAt date's dow (Wed -> 3)
    expect(keys.has('3-09:00')).toBe(true);
  });

  it('ignores invalid booked interval dates', () => {
    const keys = buildConflictKeySet({
      recurringCommitments: [],
      bookedIntervals: [{ startAt: 'not-a-date' } as any],
    });
    expect(Array.from(keys)).toEqual([]);
  });
});
