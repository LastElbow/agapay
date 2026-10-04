import type {
  TherapistAvailability,
  TherapistAvailabilityDto,
} from '@/src/services/availability';
import { dayLabelToDow, dowToDayLabel } from './dow';
import { toHHmmss } from './time';

export function normalizeSpecificDateToYyyyMmDd(
  value: unknown,
): string | undefined {
  if (value == null) return undefined;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const raw = String(value).trim();
  if (!raw) return undefined;

  // If we get an ISO datetime, preserve the date portion
  const datePart = raw.includes('T') ? raw.split('T')[0] : raw;
  const trimmed = String(datePart).trim();
  if (!trimmed) return undefined;

  // If it looks like YYYY-MM-DD, accept as-is.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // Best-effort parse fallback
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function normalizeTherapistDowToNumber(value: unknown): number {
  const label = dowToDayLabel(value as any);
  if (label) return dayLabelToDow[label];

  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = Math.trunc(value);
    if (n >= 0 && n <= 6) return n;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const n = Math.trunc(numeric);
      if (n >= 0 && n <= 6) return n;
    }
  }

  return 0;
}

export type AvailabilityLike = Pick<
  TherapistAvailability,
  'dayOfWeek' | 'startTime' | 'endTime' | 'isAvailable' | 'specificDate' | 'notes'
> & {
  specificDate?: unknown;
};

export function toTherapistAvailabilityDto(
  block: AvailabilityLike,
  isAvailableOverride?: boolean,
): TherapistAvailabilityDto {
  const isAvailable =
    typeof isAvailableOverride === 'boolean'
      ? isAvailableOverride
      : block.isAvailable ?? true;

  return {
    dayOfWeek: normalizeTherapistDowToNumber(block.dayOfWeek),
    startTime: toHHmmss(String(block.startTime ?? '')),
    endTime: toHHmmss(String(block.endTime ?? '')),
    isAvailable,
    specificDate: normalizeSpecificDateToYyyyMmDd(block.specificDate),
    notes: block.notes ?? undefined,
  };
}

export function toTherapistAvailabilityDtos(
  blocks: AvailabilityLike[],
): TherapistAvailabilityDto[] {
  return (Array.isArray(blocks) ? blocks : []).map((b) =>
    toTherapistAvailabilityDto(b),
  );
}
