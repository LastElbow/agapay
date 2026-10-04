import type { AvailabilityBlock } from '@/src/components/AvailabilitySelector';

export type TimeOption = { value: string; label: string };

export function buildAvailabilityBlocks(args: {
  selectedDays: number[];
  startTime: string;
  endTime: string;
}): AvailabilityBlock[] {
  const days = Array.isArray(args.selectedDays) ? args.selectedDays : [];
  return days.map((dayOfWeek) => ({
    dayOfWeek,
    startTime: args.startTime,
    endTime: args.endTime,
  }));
}

export function getSpecializationDisplayText(selectedSpecializations: string[]): string {
  const list = Array.isArray(selectedSpecializations) ? selectedSpecializations : [];
  if (list.length === 0) return 'Select specialization';
  if (list.length === 1) return list[0];
  if (list.length === 2) return list.join(', ');
  return `${list.slice(0, 2).join(', ')} +${list.length - 2} more`;
}

export function canProceedPreferencesStep1(args: {
  selectedSpecializations: string[];
  sessionBudget: string | null;
  preferredTherapistGender: string | null;
  selectedDays: number[];
}): boolean {
  // Mirrors current UI: truthy budget string is accepted (even '0' or 'abc').
  return (
    Array.isArray(args.selectedSpecializations) &&
    args.selectedSpecializations.length > 0 &&
    !!args.sessionBudget &&
    !!args.preferredTherapistGender &&
    Array.isArray(args.selectedDays) &&
    args.selectedDays.length > 0
  );
}

export function filterTimeOptions(args: {
  timeOptions: TimeOption[];
  timeModalOpen: 'start' | 'end' | null;
  startTime: string;
  endTime: string;
}): TimeOption[] {
  const options = Array.isArray(args.timeOptions) ? args.timeOptions : [];

  return options.filter((t) => {
    if (args.timeModalOpen === 'end') return t.value > args.startTime;
    if (args.timeModalOpen === 'start') return t.value < args.endTime;
    return true;
  });
}
