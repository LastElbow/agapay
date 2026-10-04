export function buildCancelSessionBody(input: {
  reason: string;
  proposedRescheduleStartAt?: Date | null;
  proposedRescheduleEndAt?: Date | null;
  relieverTherapistId?: number | null;
  relieverSubstitutionReason?: string | null;
}): Record<string, unknown> {
  const body: Record<string, unknown> = { reason: input.reason };

  if (input.proposedRescheduleStartAt instanceof Date) {
    body.proposedRescheduleStartAt = input.proposedRescheduleStartAt.toISOString();
  }
  if (input.proposedRescheduleEndAt instanceof Date) {
    body.proposedRescheduleEndAt = input.proposedRescheduleEndAt.toISOString();
  }

  if (typeof input.relieverTherapistId === 'number' && Number.isFinite(input.relieverTherapistId) && input.relieverTherapistId > 0) {
    body.relieverTherapistId = input.relieverTherapistId;
  }

  const relieverReason = String(input.relieverSubstitutionReason ?? '').trim();
  if (relieverReason) {
    body.relieverSubstitutionReason = relieverReason;
  }

  return body;
}

export function buildDeclineRescheduleBody(reason?: string | null): Record<string, unknown> {
  const trimmed = String(reason ?? '').trim();
  return trimmed ? { reason: trimmed } : {};
}

export function buildAcknowledgeCancellationBody(input: {
  rescheduleStartAt?: string | null;
  rescheduleEndAt?: string | null;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.rescheduleStartAt) body.rescheduleStartAt = input.rescheduleStartAt;
  if (input.rescheduleEndAt) body.rescheduleEndAt = input.rescheduleEndAt;
  return body;
}
