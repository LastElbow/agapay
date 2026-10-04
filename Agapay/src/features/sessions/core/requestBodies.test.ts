import {
  buildAcknowledgeCancellationBody,
  buildCancelSessionBody,
  buildDeclineRescheduleBody,
} from '@/src/features/sessions/core/requestBodies';

describe('sessions/requestBodies', () => {
  it('buildCancelSessionBody includes optional ISO timestamps when provided', () => {
    const start = new Date('2026-01-01T10:00:00Z');
    const end = new Date('2026-01-01T11:00:00Z');

    const body = buildCancelSessionBody({
      reason: 'schedule_conflict',
      proposedRescheduleStartAt: start,
      proposedRescheduleEndAt: end,
      relieverTherapistId: 123,
      relieverSubstitutionReason: '  out sick  ',
    });

    expect(body).toEqual({
      reason: 'schedule_conflict',
      proposedRescheduleStartAt: '2026-01-01T10:00:00.000Z',
      proposedRescheduleEndAt: '2026-01-01T11:00:00.000Z',
      relieverTherapistId: 123,
      relieverSubstitutionReason: 'out sick',
    });
  });

  it('buildCancelSessionBody omits null/invalid optional fields', () => {
    const body = buildCancelSessionBody({
      reason: 'other',
      proposedRescheduleStartAt: null,
      proposedRescheduleEndAt: undefined,
      relieverTherapistId: 0,
      relieverSubstitutionReason: '   ',
    });

    expect(body).toEqual({ reason: 'other' });
  });

  it('buildDeclineRescheduleBody trims and drops empty reasons', () => {
    expect(buildDeclineRescheduleBody('  nope  ')).toEqual({ reason: 'nope' });
    expect(buildDeclineRescheduleBody('   ')).toEqual({});
    expect(buildDeclineRescheduleBody(null)).toEqual({});
  });

  it('buildAcknowledgeCancellationBody only includes provided fields', () => {
    expect(buildAcknowledgeCancellationBody({})).toEqual({});
    expect(buildAcknowledgeCancellationBody({ rescheduleStartAt: null, rescheduleEndAt: undefined })).toEqual({});
    expect(buildAcknowledgeCancellationBody({ rescheduleStartAt: '2026-01-01T10:00:00Z' })).toEqual({
      rescheduleStartAt: '2026-01-01T10:00:00Z',
    });
  });
});
