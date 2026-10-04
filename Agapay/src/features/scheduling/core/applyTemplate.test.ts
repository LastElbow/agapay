import { generateSpecificDateBlocksFromTemplate } from '@/src/features/scheduling/core/applyTemplate';

describe('scheduling/applyTemplate', () => {
  it('generates specific-date blocks for target week and avoids duplicates', () => {
    const now = new Date(2025, 2, 19, 10, 0, 0); // Wed Mar 19 2025

    const templateBlock = {
      id: 1,
      dayOfWeek: 1, // Monday
      startTime: '09:00:00',
      endTime: '10:00:00',
      isAvailable: true,
    } as any;

    const existingSpecific = {
      id: 2,
      dayOfWeek: 1,
      startTime: '09:00:00',
      endTime: '10:00:00',
      isAvailable: true,
      specificDate: '2025-03-17',
    } as any;

    const blocks = generateSpecificDateBlocksFromTemplate({
      availData: [templateBlock, existingSpecific],
      now,
      targetWeek: 'thisWeek',
    });

    // Duplicate exists for Monday of this week, so no new blocks
    expect(blocks).toEqual([]);

    const nextWeekBlocks = generateSpecificDateBlocksFromTemplate({
      availData: [templateBlock, existingSpecific],
      now,
      targetWeek: 'nextWeek',
    });

    // Next week Monday should be 2025-03-24
    expect(nextWeekBlocks).toEqual([
      {
        dayOfWeek: 1,
        startTime: '09:00:00',
        endTime: '10:00:00',
        isAvailable: true,
        specificDate: '2025-03-24',
      },
    ]);
  });

  it('accepts dayOfWeek enum-like strings and normalizes HH:mm to HH:mm:ss', () => {
    const now = new Date(2025, 2, 19, 10, 0, 0); // Wed Mar 19 2025

    const blocks = generateSpecificDateBlocksFromTemplate({
      availData: [
        {
          id: 1,
          dayOfWeek: 'DayOfWeek.Sunday',
          startTime: '09:00',
          endTime: '10:00',
          isAvailable: true,
        } as any,
      ],
      now,
      targetWeek: 'thisWeek',
    });

    // Sunday of this week is 2025-03-23
    expect(blocks).toEqual([
      {
        dayOfWeek: 0,
        startTime: '09:00:00',
        endTime: '10:00:00',
        isAvailable: true,
        specificDate: '2025-03-23',
      },
    ]);
  });

  it('skips unavailable template blocks and treats existing specific-date blocks with a time component as duplicates', () => {
    const now = new Date(2025, 2, 19, 10, 0, 0);

    const templateUnavailable = {
      id: 1,
      dayOfWeek: 1,
      startTime: '09:00:00',
      endTime: '10:00:00',
      isAvailable: false,
    } as any;

    const templateAvailable = {
      id: 2,
      dayOfWeek: 2,
      startTime: '09:00:00',
      endTime: '10:00:00',
      isAvailable: true,
    } as any;

    const existingSpecificWithTime = {
      id: 3,
      dayOfWeek: 2,
      startTime: '09:00:00',
      endTime: '10:00:00',
      isAvailable: true,
      specificDate: '2025-03-18T00:00:00',
    } as any;

    const out = generateSpecificDateBlocksFromTemplate({
      availData: [templateUnavailable, templateAvailable, existingSpecificWithTime],
      now,
      targetWeek: 'thisWeek',
    });

    // Tuesday of this week is 2025-03-18; a specific-date entry already exists (with a time component), so no new blocks.
    expect(out).toEqual([]);
  });
});
