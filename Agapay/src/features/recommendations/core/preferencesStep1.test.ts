import {
  buildAvailabilityBlocks,
  canProceedPreferencesStep1,
  filterTimeOptions,
  getSpecializationDisplayText,
} from '@/src/features/recommendations/core/preferencesStep1';

describe('preferencesStep1', () => {
  describe('getSpecializationDisplayText', () => {
    it('formats 0/1/2/3+ selections', () => {
      expect(getSpecializationDisplayText([])).toBe('Select specialization');
      expect(getSpecializationDisplayText(['Ortho'])).toBe('Ortho');
      expect(getSpecializationDisplayText(['Ortho', 'Neuro'])).toBe('Ortho, Neuro');
      expect(getSpecializationDisplayText(['A', 'B', 'C'])).toBe('A, B +1 more');
    });
  });

  describe('canProceedPreferencesStep1', () => {
    it('requires specializations, budget, gender, and at least one day', () => {
      expect(
        canProceedPreferencesStep1({
          selectedSpecializations: [],
          sessionBudget: '100',
          preferredTherapistGender: 'Male',
          selectedDays: [1],
        }),
      ).toBe(false);

      expect(
        canProceedPreferencesStep1({
          selectedSpecializations: ['Ortho'],
          sessionBudget: null,
          preferredTherapistGender: 'Male',
          selectedDays: [1],
        }),
      ).toBe(false);

      expect(
        canProceedPreferencesStep1({
          selectedSpecializations: ['Ortho'],
          sessionBudget: '100',
          preferredTherapistGender: null,
          selectedDays: [1],
        }),
      ).toBe(false);

      expect(
        canProceedPreferencesStep1({
          selectedSpecializations: ['Ortho'],
          sessionBudget: '100',
          preferredTherapistGender: 'Male',
          selectedDays: [],
        }),
      ).toBe(false);

      expect(
        canProceedPreferencesStep1({
          selectedSpecializations: ['Ortho'],
          sessionBudget: '100',
          preferredTherapistGender: 'Male',
          selectedDays: [1],
        }),
      ).toBe(true);
    });
  });

  describe('buildAvailabilityBlocks', () => {
    it('creates blocks for each selected day', () => {
      const blocks = buildAvailabilityBlocks({
        selectedDays: [1, 3],
        startTime: '08:00',
        endTime: '17:00',
      });
      expect(blocks).toEqual([
        { dayOfWeek: 1, startTime: '08:00', endTime: '17:00' },
        { dayOfWeek: 3, startTime: '08:00', endTime: '17:00' },
      ]);
    });
  });

  describe('filterTimeOptions', () => {
    const options = [
      { value: '08:00', label: '8 AM' },
      { value: '12:00', label: '12 PM' },
      { value: '17:00', label: '5 PM' },
    ];

    it('filters end options after start time', () => {
      const out = filterTimeOptions({
        timeOptions: options,
        timeModalOpen: 'end',
        startTime: '12:00',
        endTime: '17:00',
      });
      expect(out.map((o) => o.value)).toEqual(['17:00']);
    });

    it('filters start options before end time', () => {
      const out = filterTimeOptions({
        timeOptions: options,
        timeModalOpen: 'start',
        startTime: '08:00',
        endTime: '12:00',
      });
      expect(out.map((o) => o.value)).toEqual(['08:00']);
    });

    it('does not filter when modal closed', () => {
      const out = filterTimeOptions({
        timeOptions: options,
        timeModalOpen: null,
        startTime: '08:00',
        endTime: '17:00',
      });
      expect(out).toEqual(options);
    });
  });
});
