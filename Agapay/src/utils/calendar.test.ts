import {
  dateToISOString,
  generateCalendarMonth,
  getCurrentYearMonth,
  getDayHeaders,
  getMonthName,
  getNextMonth,
  getPreviousMonth,
  isSameDay,
} from '@/src/utils/calendar';

describe('calendar utils', () => {
  afterEach(() => {
    // Ensure other tests are not affected
    jest.useRealTimers();
  });

  it('generates a month grid with 7-day weeks and correct padding', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2020, 0, 15, 12, 0, 0)); // Jan 15, 2020 (local noon)

    const weeks = generateCalendarMonth(2020, 0);
    expect(weeks.length).toBeGreaterThanOrEqual(4);

    for (const w of weeks) {
      expect(w.days).toHaveLength(7);
    }

    const firstWeek = weeks[0].days;
    // Jan 1, 2020 is Wednesday; the first week should start on Sunday (Dec 29, 2019)
    expect(firstWeek[0].date.getFullYear()).toBe(2019);
    expect(firstWeek[0].date.getMonth()).toBe(11);
    expect(firstWeek[0].dayOfMonth).toBe(29);
    expect(firstWeek[0].isCurrentMonth).toBe(false);

    expect(firstWeek[3].date.getFullYear()).toBe(2020);
    expect(firstWeek[3].date.getMonth()).toBe(0);
    expect(firstWeek[3].dayOfMonth).toBe(1);
    expect(firstWeek[3].isCurrentMonth).toBe(true);

    const allDays = weeks.flatMap((w) => w.days);
    const jan15 = allDays.find((d) => d.isCurrentMonth && d.dayOfMonth === 15);
    expect(jan15?.isToday).toBe(true);

    // Weekend flag should match Date.getDay()
    for (const d of allDays) {
      const isWeekend = d.date.getDay() === 0 || d.date.getDay() === 6;
      expect(d.isWeekend).toBe(isWeekend);
    }
  });

  it('formats and compares dates by calendar day', () => {
    const a = new Date(2024, 11, 31, 0, 0, 0);
    const b = new Date(2024, 11, 31, 23, 59, 59);
    const c = new Date(2025, 0, 1, 0, 0, 0);

    expect(dateToISOString(a)).toBe('2024-12-31');
    expect(isSameDay(a, b)).toBe(true);
    expect(isSameDay(a, c)).toBe(false);
  });

  it('provides month/day helpers', () => {
    expect(getMonthName(0)).toBe('January');
    expect(getMonthName(11)).toBe('December');
    expect(getDayHeaders()).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

    const prev = getPreviousMonth(2024, 0);
    expect(prev).toEqual({ year: 2023, month: 11 });

    const next = getNextMonth(2024, 11);
    expect(next).toEqual({ year: 2025, month: 0 });

    const { year, month } = getCurrentYearMonth();
    expect(typeof year).toBe('number');
    expect(typeof month).toBe('number');
  });
});
