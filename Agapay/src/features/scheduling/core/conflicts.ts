import type { BookedInterval } from '@/src/services/availability';
import type { RecurringCommitment } from '@/src/services/contracts';
import { toHHmm } from '@/src/features/scheduling/core/time';

export const buildConflictKeySet = (params: {
  recurringCommitments: RecurringCommitment[] | null | undefined;
  bookedIntervals: BookedInterval[] | null | undefined;
}): Set<string> => {
  const { recurringCommitments, bookedIntervals } = params;
  const out = new Set<string>();

  (recurringCommitments || []).forEach((slot) => {
    const start = toHHmm((slot as any)?.startTime ?? '');
    if (!start) return;
    out.add(`${(slot as any).dayOfWeek}-${start}`);
  });

  (bookedIntervals || []).forEach((slot) => {
    const startDate = new Date((slot as any).startAt);
    if (!Number.isFinite(startDate.getTime())) return;
    const dow = startDate.getDay();
    const start = toHHmm(startDate.toTimeString());
    if (!start) return;
    out.add(`${dow}-${start}`);
  });

  return out;
};
