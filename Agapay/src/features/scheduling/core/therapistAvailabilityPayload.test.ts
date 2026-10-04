import {
  normalizeSpecificDateToYyyyMmDd,
  normalizeTherapistDowToNumber,
  toTherapistAvailabilityDto,
} from './therapistAvailabilityPayload';

describe('therapistAvailabilityPayload', () => {
  describe('normalizeSpecificDateToYyyyMmDd', () => {
    it('returns undefined for nullish/empty', () => {
      expect(normalizeSpecificDateToYyyyMmDd(undefined)).toBeUndefined();
      expect(normalizeSpecificDateToYyyyMmDd(null)).toBeUndefined();
      expect(normalizeSpecificDateToYyyyMmDd('')).toBeUndefined();
      expect(normalizeSpecificDateToYyyyMmDd('   ')).toBeUndefined();
    });

    it('extracts date from ISO datetime string', () => {
      expect(normalizeSpecificDateToYyyyMmDd('2026-03-19T00:00:00Z')).toBe(
        '2026-03-19',
      );
      expect(
        normalizeSpecificDateToYyyyMmDd('2026-03-19T08:30:00.000+08:00'),
      ).toBe('2026-03-19');
    });

    it('accepts YYYY-MM-DD as-is', () => {
      expect(normalizeSpecificDateToYyyyMmDd('2026-03-19')).toBe('2026-03-19');
    });

    it('handles Date instances', () => {
      const d = new Date(2026, 2, 19); // local time
      expect(normalizeSpecificDateToYyyyMmDd(d)).toBe('2026-03-19');
    });
  });

  describe('normalizeTherapistDowToNumber', () => {
    it('normalizes from labels', () => {
      expect(normalizeTherapistDowToNumber('Monday')).toBe(1);
      expect(normalizeTherapistDowToNumber('Saturday')).toBe(6);
    });

    it('normalizes from qualified enum strings', () => {
      expect(
        normalizeTherapistDowToNumber('agapay_backend.Entities.DayOfWeekEnum.Monday'),
      ).toBe(1);
    });

    it('accepts numeric strings and numbers', () => {
      expect(normalizeTherapistDowToNumber('0')).toBe(0);
      expect(normalizeTherapistDowToNumber(3)).toBe(3);
      expect(normalizeTherapistDowToNumber(6)).toBe(6);
    });

    it('falls back to 0 on invalid values', () => {
      expect(normalizeTherapistDowToNumber('not-a-day')).toBe(0);
      expect(normalizeTherapistDowToNumber(99)).toBe(0);
    });
  });

  describe('toTherapistAvailabilityDto', () => {
    it('normalizes times to HH:mm:ss and specificDate to YYYY-MM-DD', () => {
      const dto = toTherapistAvailabilityDto({
        dayOfWeek: 'Monday',
        startTime: '10:00',
        endTime: '11:30',
        isAvailable: true,
        specificDate: '2026-03-19T00:00:00Z',
        notes: null,
      } as any);

      expect(dto).toEqual({
        dayOfWeek: 1,
        startTime: '10:00:00',
        endTime: '11:30:00',
        isAvailable: true,
        specificDate: '2026-03-19',
        notes: undefined,
      });
    });

    it('can override isAvailable for delete semantics', () => {
      const dto = toTherapistAvailabilityDto(
        {
          dayOfWeek: 2,
          startTime: '09:00',
          endTime: '10:00',
          isAvailable: true,
        } as any,
        false,
      );

      expect(dto.isAvailable).toBe(false);
    });
  });
});
