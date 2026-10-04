import type { TherapistAvailability } from '@/src/services/availability';
import { hhmmToMinutes, minutesToHHmm, toHHmm } from '@/src/features/scheduling/core/time';
import { getWeekRange, getDateForDowInWeek, parseYmdToLocalDate } from '@/src/features/scheduling/core/weekRange';

export type DiscretizedSlot = { start: string; end: string };

export const normalizeDayOfWeek = (value: TherapistAvailability['dayOfWeek']): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 0 || value > 6) return null;
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      if (numeric < 0 || numeric > 6) return null;
      return numeric;
    }

    const lower = trimmed.toLowerCase();
    const normalized = lower.includes('.') ? lower.substring(lower.lastIndexOf('.') + 1) : lower;

    const lookup: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    return lookup[normalized] ?? null;
  }

  return null;
};

const buildDowsWithSpecificBlocks = (params: {
  availabilityBlocks: TherapistAvailability[] | null | undefined;
  rangeStart: Date;
  rangeEnd: Date;
}): Set<number> => {
  const { availabilityBlocks, rangeStart, rangeEnd } = params;
  const out = new Set<number>();

  (availabilityBlocks || []).forEach((block) => {
    if (!block || block.isAvailable === false) return;
    if (!(block as any).specificDate) return;

    const blockDate = parseYmdToLocalDate(String((block as any).specificDate));
    if (!blockDate) return;
    if (blockDate < rangeStart || blockDate > rangeEnd) return;

    out.add(blockDate.getDay());
  });

  return out;
};

export const discretizeAvailabilityForWeek = (params: {
  availabilityBlocks: TherapistAvailability[] | null | undefined;
  now: Date;
  weekOffset: 0 | 1;
  slotDurationMinutes?: number;
  includeRecurringWhenNoSpecificDate?: boolean;
}): Record<number, DiscretizedSlot[]> => {
  const {
    availabilityBlocks,
    now,
    weekOffset,
    slotDurationMinutes = 60,
    includeRecurringWhenNoSpecificDate = true,
  } = params;
  const map: Record<number, DiscretizedSlot[]> = {};

  const { start: weekStart, end: weekEnd } = getWeekRange(now, weekOffset);

  const dowsWithSpecificBlocks = buildDowsWithSpecificBlocks({
    availabilityBlocks,
    rangeStart: weekStart,
    rangeEnd: weekEnd,
  });

  (availabilityBlocks || []).forEach((block) => {
    if (!block || block.isAvailable === false) return;

    let dow = normalizeDayOfWeek(block.dayOfWeek);
    if (dow == null) return;

    const rawSpecificDate = (block as any).specificDate;
    if (rawSpecificDate) {
      const blockDate = parseYmdToLocalDate(String(rawSpecificDate));
      if (!blockDate) return;
      if (blockDate < weekStart || blockDate > weekEnd) return;
      dow = blockDate.getDay();
    } else {
      if (!includeRecurringWhenNoSpecificDate) return;
      if (dowsWithSpecificBlocks.has(dow)) return;
    }

    const startHHmm = toHHmm((block as any)?.startTime ?? '');
    const endHHmm = toHHmm((block as any)?.endTime ?? '');
    const startMinutes = hhmmToMinutes(startHHmm);
    const endMinutes = hhmmToMinutes(endHHmm);
    if (startMinutes == null || endMinutes == null) return;
    if (endMinutes <= startMinutes) return;

    for (
      let cursor = startMinutes;
      cursor + slotDurationMinutes <= endMinutes;
      cursor += slotDurationMinutes
    ) {
      const slotStart = minutesToHHmm(cursor);
      const slotEnd = minutesToHHmm(cursor + slotDurationMinutes);
      if (!map[dow]) map[dow] = [];
      map[dow].push({ start: slotStart, end: slotEnd });
    }
  });

  Object.values(map).forEach((slots) => slots.sort((a, b) => a.start.localeCompare(b.start)));

  return map;
};

export type DayOption = {
  dow: number;
  label: string;
  slots: DiscretizedSlot[];
  dateLabel: string;
  isPast: boolean;
};

export const buildDayOptionsForWeek = (params: {
  discretizedAvailability: Record<number, DiscretizedSlot[]>;
  now: Date;
  weekOffset: 0 | 1;
  dowToDayLabel: (dow: number) => string | null;
}): DayOption[] => {
  const { discretizedAvailability, now, weekOffset, dowToDayLabel } = params;

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const { start: weekStartMonday } = getWeekRange(now, weekOffset);

  const result = Object.entries(discretizedAvailability)
    .reduce<DayOption[]>((acc, [dowStr, slots]) => {
      const dow = Number(dowStr);
      const dayName = dowToDayLabel(dow);
      if (!dayName || slots.length === 0) return acc;

      const targetDate = getDateForDowInWeek(weekStartMonday, dow);
      if (!targetDate) return acc;

      const isPast = weekOffset === 0 ? targetDate < startOfToday : false;

      const dateLabel = targetDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });

      acc.push({
        dow,
        label: `${dayName} (${dateLabel})`,
        slots,
        dateLabel,
        isPast,
      });

      return acc;
    }, [])
    .sort((a, b) => {
      const orderA = a.dow === 0 ? 7 : a.dow;
      const orderB = b.dow === 0 ? 7 : b.dow;
      return orderA - orderB;
    });

  return result;
};
