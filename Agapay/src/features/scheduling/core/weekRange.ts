import { dowToMondayOffset } from '@/src/features/scheduling/core/dow';

export type WeekRange = { start: Date; end: Date };

export const getStartOfWeekMonday = (now: Date): Date => {
  const today = new Date(now);
  const todayIndex = today.getDay();
  const daysSinceMonday = dowToMondayOffset(todayIndex) ?? 0;
  const startOfThisWeek = new Date(today);
  startOfThisWeek.setDate(today.getDate() - daysSinceMonday);
  startOfThisWeek.setHours(0, 0, 0, 0);
  return startOfThisWeek;
};

export const getWeekRange = (now: Date, offsetWeeks: number): WeekRange => {
  const startOfWeek = getStartOfWeekMonday(now);
  const start = new Date(startOfWeek);
  start.setDate(startOfWeek.getDate() + offsetWeeks * 7);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

export const getDateForDowInWeek = (
  startOfWeekMonday: Date,
  dow: number,
): Date | null => {
  const offsetFromMonday = dowToMondayOffset(dow);
  if (offsetFromMonday == null) return null;
  const targetDate = new Date(startOfWeekMonday);
  targetDate.setDate(startOfWeekMonday.getDate() + offsetFromMonday);
  targetDate.setHours(0, 0, 0, 0);
  return targetDate;
};

export const formatYmd = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const parseYmdToLocalDate = (ymd: string): Date | null => {
  const dateStr = String(ymd ?? '').split('T')[0];
  const parts = dateStr.split('-');
  if (parts.length < 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  d.setHours(0, 0, 0, 0);

  // Ensure JS Date didn't roll overflow (e.g. Feb 31 -> Mar 3)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
};
