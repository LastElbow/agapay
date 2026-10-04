using System;
using System.Linq.Expressions;
using agapay_backend.Entities;

namespace agapay_backend.Services
{
  /// <summary>
  /// Shared session-conflict predicate. Matches active sessions (not Cancelled,
  /// Completed or DoneForToday) for a therapist whose time range overlaps the
  /// half-open interval [startUtc, endUtc) — previously duplicated inline at the
  /// Create, ApproveReschedule and Reschedule endpoints of SessionsController.
  /// </summary>
  public static class SessionQueries
  {
    public static Expression<Func<TherapySession, bool>> Overlaps(int therapistId, DateTime startUtc, DateTime endUtc, int? excludeSessionId)
    {
      return s =>
        s.PhysicalTherapistId == therapistId
        && (excludeSessionId == null || s.Id != excludeSessionId.Value)
        && s.Status != SessionStatus.Cancelled
        && s.Status != SessionStatus.Completed
        && s.Status != SessionStatus.DoneForToday
        && s.StartAt < endUtc
        && startUtc < s.EndAt;
    }
  }
}
