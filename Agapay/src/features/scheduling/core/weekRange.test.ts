import {
  formatYmd,
  getDateForDowInWeek,
  getStartOfWeekMonday,
  getWeekRange,
  parseYmdToLocalDate,
} from '@/src/features/scheduling/core/weekRange';

describe('scheduling/weekRange', () => {
  it('getStartOfWeekMonday uses Monday-start weeks', () => {
    // Wed Mar 19 2025 -> Monday Mar 17 2025
    const now = new Date(2025, 2, 19, 10, 0, 0);
    const start = getStartOfWeekMonday(now);
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(2);
    expect(start.getDate()).toBe(17);
    expect(start.getHours()).toBe(0);
  });

  it('getWeekRange returns Monday 00:00 through Sunday 23:59:59.999', () => {
    const now = new Date(2025, 2, 19, 10, 0, 0);
    const { start, end } = getWeekRange(now, 0);
    expect(start.getDay()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(end.getDay()).toBe(0);
    expect(end.getHours()).toBe(23);
  });

  it('getDateForDowInWeek maps dow to correct day within week', () => {
    const now = new Date(2025, 2, 19, 10, 0, 0);
    const week = getWeekRange(now, 0);
    const sunday = getDateForDowInWeek(week.start, 0);
    const monday = getDateForDowInWeek(week.start, 1);
    expect(monday?.getDay()).toBe(1);
    expect(sunday?.getDay()).toBe(0);
    expect(sunday && formatYmd(sunday)).toBe('2025-03-23');
  });

  it('parseYmdToLocalDate parses YYYY-MM-DD and YYYY-MM-DDTHH:mm:ss', () => {
    const a = parseYmdToLocalDate('2025-03-19');
    const b = parseYmdToLocalDate('2025-03-19T00:00:00');
    expect(a && formatYmd(a)).toBe('2025-03-19');
    expect(b && formatYmd(b)).toBe('2025-03-19');
  });

  it('parseYmdToLocalDate rejects invalid dates (no rollover)', () => {
    expect(parseYmdToLocalDate('')).toBeNull();
    expect(parseYmdToLocalDate('2025-02')).toBeNull();
    expect(parseYmdToLocalDate('2025-13-01')).toBeNull();
    expect(parseYmdToLocalDate('2025-00-10')).toBeNull();
    expect(parseYmdToLocalDate('2025-02-31')).toBeNull();
    expect(parseYmdToLocalDate('2025-04-31')).toBeNull();
  });
});
