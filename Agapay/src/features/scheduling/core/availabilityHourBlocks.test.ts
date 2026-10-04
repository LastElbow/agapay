import {
  availabilityBlocksToHourStarts,
  hourStartsToAvailabilityBlocks,
  timeStringToHour,
} from '@/src/features/scheduling/core/availabilityHourBlocks';

describe('scheduling/availabilityHourBlocks', () => {
  it('timeStringToHour accepts HH:MM:SS and HH:MM and rejects invalid', () => {
    expect(timeStringToHour('09:00:00')).toBe(9);
    expect(timeStringToHour('09:30')).toBe(9);
    expect(timeStringToHour('')).toBeNull();
    expect(timeStringToHour('oops')).toBeNull();
    expect(timeStringToHour('-1:00:00')).toBeNull();
    expect(timeStringToHour('25:00:00')).toBeNull();
  });

  it('hourStartsToAvailabilityBlocks merges consecutive hours into a single block', () => {
    const blocks = hourStartsToAvailabilityBlocks({
      dayOfWeek: 1,
      hourStarts: new Set([9, 10, 11]),
    });

    expect(blocks).toEqual([
      { dayOfWeek: 1, startTime: '09:00:00', endTime: '12:00:00' },
    ]);
  });

  it('hourStartsToAvailabilityBlocks splits blocks on gaps and ignores invalid hours', () => {
    const blocks = hourStartsToAvailabilityBlocks({
      dayOfWeek: 2,
      hourStarts: [9, 11, 12, 999, -1],
    });

    expect(blocks).toEqual([
      { dayOfWeek: 2, startTime: '09:00:00', endTime: '10:00:00' },
      { dayOfWeek: 2, startTime: '11:00:00', endTime: '13:00:00' },
    ]);
  });

  it('availabilityBlocksToHourStarts expands blocks into hour starts', () => {
    const hours = availabilityBlocksToHourStarts({
      dayOfWeek: 3,
      blocks: [
        { dayOfWeek: 3, startTime: '09:00:00', endTime: '11:00:00' },
        { dayOfWeek: 3, startTime: '13:00:00', endTime: '14:00:00' },
      ],
    });

    expect(Array.from(hours).sort((a, b) => a - b)).toEqual([9, 10, 13]);
  });

  it('availabilityBlocksToHourStarts ignores invalid ranges and other days', () => {
    const hours = availabilityBlocksToHourStarts({
      dayOfWeek: 1,
      blocks: [
        { dayOfWeek: 1, startTime: '11:00:00', endTime: '10:00:00' }, // inverted
        { dayOfWeek: 2, startTime: '09:00:00', endTime: '10:00:00' }, // other day
        { dayOfWeek: 1, startTime: 'oops', endTime: '10:00:00' }, // invalid
      ],
    });

    expect(Array.from(hours)).toEqual([]);
  });
});
