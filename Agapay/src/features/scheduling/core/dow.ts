export type DayLabel =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

export const DAYS_MON_START: DayLabel[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export const DAY_NUMBER_LOOKUP: Record<number, DayLabel> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export const dayLabelToDow: Record<DayLabel, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const DAY_NAME_LOOKUP: Record<string, DayLabel> = DAYS_MON_START.reduce(
  (acc, day) => {
    acc[day.toLowerCase()] = day;
    return acc;
  },
  {} as Record<string, DayLabel>,
);

export const dowToDayLabel = (
  value: number | string | null | undefined,
): DayLabel | null => {
  if (value == null) return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return DAY_NUMBER_LOOKUP[value] ?? null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      return DAY_NUMBER_LOOKUP[numeric] ?? null;
    }

    const lower = trimmed.toLowerCase();
    const normalized = lower.includes('.')
      ? lower.substring(lower.lastIndexOf('.') + 1)
      : lower;

    return DAY_NAME_LOOKUP[normalized] ?? null;
  }

  return null;
};

export const dowToMondayOffset = (dow: number): number | null => {
  if (!Number.isFinite(dow)) return null;
  const normalized = Number(dow);
  if (normalized < 0 || normalized > 6) return null;
  return normalized === 0 ? 6 : normalized - 1;
};
