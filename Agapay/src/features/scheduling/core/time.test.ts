import {
  hhmmTo12,
  hhmmToMinutes,
  minutesToHHmm,
  parseTimeToMinutes,
  toFriendlyTime,
  toHHmm,
  toHHmmss,
} from '@/src/features/scheduling/core/time';

describe('scheduling/time', () => {
  it('parseTimeToMinutes is strict and supports 24:00', () => {
    expect(parseTimeToMinutes('09:00')).toBe(540);
    expect(parseTimeToMinutes('9:00')).toBeNull();
    expect(parseTimeToMinutes('09:0')).toBeNull();
    expect(parseTimeToMinutes('24:00')).toBe(1440);
    expect(parseTimeToMinutes('24:01')).toBeNull();
    expect(parseTimeToMinutes('25:00')).toBeNull();
    expect(parseTimeToMinutes('00:60')).toBeNull();
  });

  it('hhmmToMinutes is looser (accepts HH:MM prefix)', () => {
    expect(hhmmToMinutes('09:00')).toBe(540);
    expect(hhmmToMinutes('09:00:00')).toBe(540);
    expect(hhmmToMinutes('24:00:00')).toBe(1440);
    expect(hhmmToMinutes('24:01')).toBeNull();
    expect(hhmmToMinutes('25:00')).toBeNull();
    expect(hhmmToMinutes('00:60')).toBeNull();
    expect(hhmmToMinutes('')).toBeNull();
    expect(hhmmToMinutes('oops')).toBeNull();
  });

  it('minutesToHHmm pads hours/minutes', () => {
    expect(minutesToHHmm(0)).toBe('00:00');
    expect(minutesToHHmm(75)).toBe('01:15');
  });

  it('toHHmm takes first two components', () => {
    expect(toHHmm('9:5:00')).toBe('09:05');
    expect(toHHmm('09:05:00')).toBe('09:05');
  });

  it('toHHmmss matches schedule behavior', () => {
    expect(toHHmmss('')).toBe('');
    expect(toHHmmss('09:00')).toBe('09:00:00');
    expect(toHHmmss('09:00:00')).toBe('09:00:00');
    expect(toHHmmss('24:00')).toBe('23:59:59');
  });

  it('toFriendlyTime returns 12h display', () => {
    expect(toFriendlyTime('00:00')).toBe('12:00 AM');
    expect(toFriendlyTime('12:00')).toBe('12:00 PM');
    expect(toFriendlyTime('13:05')).toBe('1:05 PM');
  });

  it('hhmmTo12 returns 12h display for pickers', () => {
    expect(hhmmTo12('00:00')).toBe('12:00 AM');
    expect(hhmmTo12('12:00')).toBe('12:00 PM');
    expect(hhmmTo12('23:30')).toBe('11:30 PM');
  });
});
