import type { TherapistAvailability, TherapistAvailabilityDto } from '@/src/services/availability';
import { dowToDayLabel, dayLabelToDow } from '@/src/features/scheduling/core/dow';
import { toHHmmss } from '@/src/features/scheduling/core/time';
import { formatYmd, getWeekRange, getDateForDowInWeek } from '@/src/features/scheduling/core/weekRange';

export type ApplyTemplateTargetWeek = 'thisWeek' | 'nextWeek';

export const generateSpecificDateBlocksFromTemplate = (params: {
  availData: TherapistAvailability[];
  now: Date;
  targetWeek: ApplyTemplateTargetWeek;
}): TherapistAvailabilityDto[] => {
  const { availData, now, targetWeek } = params;

  const templateBlocks = (availData || []).filter(
    (b) => b && b.isAvailable !== false && !(b as any).specificDate,
  );

  const offsetWeeks = targetWeek === 'nextWeek' ? 1 : 0;
  const { start: startOfTargetWeek } = getWeekRange(now, offsetWeeks);

  const newBlocks: TherapistAvailabilityDto[] = [];

  templateBlocks.forEach((block) => {
    const dayLabel = dowToDayLabel(block.dayOfWeek as any);
    if (!dayLabel) return;

    const dow = dayLabelToDow[dayLabel];
    const targetDate = getDateForDowInWeek(startOfTargetWeek, dow);
    if (!targetDate) return;

    const specificDateStr = formatYmd(targetDate);

    const alreadyExists = (availData || []).some((existing) => {
      if (!(existing as any).specificDate) return false;
      const existingDateStr = String((existing as any).specificDate).split('T')[0];
      return (
        existingDateStr === specificDateStr &&
        existing.startTime === block.startTime &&
        existing.endTime === block.endTime &&
        existing.isAvailable !== false
      );
    });

    if (alreadyExists) return;

    newBlocks.push({
      dayOfWeek: dow,
      startTime: toHHmmss(block.startTime),
      endTime: toHHmmss(block.endTime),
      isAvailable: true,
      specificDate: specificDateStr,
    });
  });

  return newBlocks;
};
