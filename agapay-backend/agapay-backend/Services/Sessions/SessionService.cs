using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using agapay_backend.Common;
using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Models.Requests;
using agapay_backend.Services.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace agapay_backend.Services.Sessions
{
    /// <summary>
    /// Session business logic extracted verbatim from SessionsController and the
    /// session endpoints of ContractsController, plus the shared DoneForToday reset
    /// used by the background services. Responses are returned as SessionActionResult
    /// records; controllers map them back to the original IActionResult types.
    /// </summary>
    public class SessionService : ISessionService
    {
        private readonly agapayDbContext _db;
        private readonly IRealtimeNotifier _realtimeNotifier;
        private readonly ILogger<SessionService> _logger;

        public SessionService(agapayDbContext db, IRealtimeNotifier realtimeNotifier, ILogger<SessionService> logger)
        {
            _db = db;
            _realtimeNotifier = realtimeNotifier;
            _logger = logger;
        }

        // POST: /api/sessions (body moved from SessionsController.Create)
        public async Task<SessionActionResult> CreateAsync(ClaimsPrincipal user, CreateSessionRequest dto)
        {
            var startAtUtc = DateTimeUtils.NormalizeToUtc(dto.StartAt);
            var endAtUtc = DateTimeUtils.NormalizeToUtc(dto.EndAt);
            if (endAtUtc <= startAtUtc) return new SessionActionResult(400, "EndAt must be after StartAt");

            var me = await user.GetForCallerAsync(_db);
            if (!user.IsInRole("Admin"))
            {
                if (me is null || me.Id != dto.TherapistId) return new SessionActionResult(403, null);
            }

            var contract = await _db.Contracts
                .Include(c => c.Patient)
                .FirstOrDefaultAsync(c => c.Id == dto.ContractId);
            if (contract is null) return new SessionActionResult(404, "Contract not found");
            if (!user.IsInRole("Admin") && contract.PhysicalTherapistId != dto.TherapistId)
                return new SessionActionResult(400, "Contract does not belong to the therapist");

            var duration = (int)Math.Round((endAtUtc - startAtUtc).TotalMinutes);
            if (duration <= 0) return new SessionActionResult(400, "Invalid duration");

            var hasTherapistOverlap = await _db.TherapySessions
              .AsNoTracking()
              .Where(SessionQueries.Overlaps(dto.TherapistId, startAtUtc, endAtUtc, excludeSessionId: null))
              .AnyAsync();

            if (hasTherapistOverlap)
            {
                return new SessionActionResult(400, new { message = "The selected time conflicts with another session." });
            }

            var totalFee = contract.TotalFee ?? ((contract.ProfessionalFee ?? 0) + (contract.LocationFee ?? 0) + (contract.MiscellaneousFee ?? 0));

            var session = new TherapySession
            {
                PatientId = contract.PatientId,
                PhysicalTherapistId = dto.TherapistId,
                ContractId = contract.Id,
                LocationAddress = dto.LocationAddress,
                Latitude = dto.Latitude,
                Longitude = dto.Longitude,
                StartAt = startAtUtc,
                EndAt = endAtUtc,
                DurationMinutes = duration,
                TotalFee = totalFee,
                PatientFee = totalFee,
                ProfessionalFee = contract.ProfessionalFee,
                LocationFee = contract.LocationFee,
                MiscellaneousFee = contract.MiscellaneousFee,
                ConditionCase = contract.CaseToTreat,
                Status = SessionStatus.Scheduled,
                SessionNumber = 1,
                DetailsProposedAt = contract.BlueprintProposedAt,
                DetailsConfirmedAt = contract.BlueprintConfirmedAt,
            };

            _db.TherapySessions.Add(session);
            await _db.SaveChangesAsync();

            // Broadcast real-time notification to therapist that a new session was created
            // This allows therapists viewing the schedule to see when time slots are taken
            var therapistUserId = me?.UserId.ToString();
            if (!string.IsNullOrEmpty(therapistUserId))
            {
                var payload = new
                {
                    sessionId = session.Id,
                    therapistId = session.PhysicalTherapistId,
                    patientId = session.PatientId,
                    startAt = session.StartAt,
                    endAt = session.EndAt,
                    status = session.Status.ToString(),
                    message = "A new session has been scheduled."
                };
                await _realtimeNotifier.SendToUserAsync(RealtimeHub.Sessions, therapistUserId, SignalREvents.SessionCreated, payload);
            }

            return new SessionActionResult(200, new { id = session.Id });
        }

        // PUT: /api/sessions/{sessionId}/cancel (body moved from SessionsController.Cancel)
        public async Task<SessionActionResult> CancelAsync(ClaimsPrincipal user, int sessionId, CancelSessionRequest body)
        {
            var userId = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId is null) return new SessionActionResult(401, null);
            var guid = Guid.Parse(userId);

            var s = await _db.TherapySessions
                .Include(x => x.Patient)
                .Include(x => x.PhysicalTherapist)
                .FirstOrDefaultAsync(x => x.Id == sessionId);
            if (s is null) return new SessionActionResult(404, null);

            var isTherapist = s.PhysicalTherapist?.UserId == guid;
            var isPatient = s.Patient?.UserId == guid;
            if (!isTherapist && !isPatient && !user.IsInRole("Admin")) return new SessionActionResult(403, null);

            if (s.Status == SessionStatus.Completed)
                return new SessionActionResult(400, "Cannot cancel a completed session");

            // If therapist is proposing a reschedule, determine the appropriate status
            // Otherwise, mark as Cancelled immediately
            if (isTherapist && body != null && body.ProposedRescheduleStartAt.HasValue && body.ProposedRescheduleEndAt.HasValue)
            {
                var proposedStartAt = body.ProposedRescheduleStartAt.Value;
                var proposedEndAt = body.ProposedRescheduleEndAt.Value;

                // Normalize to UTC for consistent comparison/storage.
                proposedStartAt = DateTimeUtils.NormalizeToUtc(proposedStartAt);
                proposedEndAt = DateTimeUtils.NormalizeToUtc(proposedEndAt);

                // Validate proposed times
                if (proposedEndAt <= proposedStartAt)
                    return new SessionActionResult(400, "Proposed end time must be after start time");

                if (proposedStartAt <= DateTime.UtcNow)
                    return new SessionActionResult(400, "Proposed start time must be in the future");

                // If a reliever therapist is specified, validate it exists
                if (body.RelieverTherapistId.HasValue)
                {
                    var relieverExists = await _db.PhysicalTherapists
                        .AnyAsync(pt => pt.Id == body.RelieverTherapistId.Value);
                    if (!relieverExists)
                        return new SessionActionResult(400, "Specified reliever therapist not found");

                    s.RelieverTherapistId = body.RelieverTherapistId;
                    s.RelieverSubstitutionReason = string.IsNullOrWhiteSpace(body.RelieverSubstitutionReason)
                        ? null : body.RelieverSubstitutionReason.Trim();
                    s.IsRelieverProposed = true;
                    s.RelieverProposedAt = DateTime.UtcNow;

                    // When reliever is proposed, status should be PendingRelieverAcceptance
                    // Only after reliever accepts does it become PendingRescheduleApproval
                    s.Status = SessionStatus.PendingRelieverAcceptance;
                }
                else
                {
                    // Clear reliever fields if not proposing a reliever
                    s.RelieverTherapistId = null;
                    s.RelieverSubstitutionReason = null;
                    s.IsRelieverProposed = false;
                    s.RelieverProposedAt = null;

                    // No reliever, go directly to patient approval
                    s.Status = SessionStatus.PendingRescheduleApproval;
                }

                s.ProposedRescheduleStartAt = proposedStartAt;
                s.ProposedRescheduleEndAt = proposedEndAt;
                s.RescheduleProposalReason = string.IsNullOrWhiteSpace(body.Reason) ? null : body.Reason.Trim();
                s.RescheduleProposedAt = DateTime.UtcNow;
            }
            else
            {
                s.Status = SessionStatus.Cancelled;
                s.CancellationReason = string.IsNullOrWhiteSpace(body?.Reason) ? null : body!.Reason!.Trim();
                s.CancelledAt = DateTime.UtcNow;
                s.CancelledBy = isTherapist ? CancellationInitiator.Therapist : (isPatient ? CancellationInitiator.Patient : s.CancelledBy);
            }

            await _db.SaveChangesAsync();

            // Get the user IDs of both participants
            var patientUserId = s.Patient?.UserId.ToString();
            var therapistUserId = s.PhysicalTherapist?.UserId.ToString();

            // Handle notifications based on status
            if (s.Status == SessionStatus.PendingRelieverAcceptance && s.IsRelieverProposed && s.RelieverTherapistId.HasValue)
            {
                // New sequential workflow: reliever must accept first before patient is notified
                var relieverTherapist = await _db.PhysicalTherapists
                    .Include(t => t.User)
                    .FirstOrDefaultAsync(t => t.Id == s.RelieverTherapistId.Value);

                if (relieverTherapist != null)
                {
                    var relieverUserId = relieverTherapist.UserId.ToString();
                    var relieverPayload = new
                    {
                        sessionId = s.Id,
                        contractId = s.ContractId,
                        patientId = s.PatientId,
                        patientName = s.Patient != null ? NameUtils.FullName(s.Patient.FirstName, s.Patient.LastName) : null,
                        originalTherapistId = s.PhysicalTherapistId,
                        originalTherapistName = s.PhysicalTherapist != null ? NameUtils.FullName(s.PhysicalTherapist.User?.FirstName, s.PhysicalTherapist.User?.LastName) : null,
                        proposedRescheduleStartAt = s.ProposedRescheduleStartAt,
                        proposedRescheduleEndAt = s.ProposedRescheduleEndAt,
                        rescheduleProposalReason = s.RescheduleProposalReason,
                        relieverSubstitutionReason = s.RelieverSubstitutionReason,
                        locationAddress = s.LocationAddress,
                        conditionCase = s.ConditionCase,
                        totalFee = s.TotalFee,
                        status = "PendingRelieverAcceptance"
                    };
                    await _realtimeNotifier.SendToUserAsync(RealtimeHub.Sessions, relieverUserId, SignalREvents.RelieverProposed, relieverPayload);
                }

                // Notify therapist that reliever was proposed (but patient not yet notified)
                if (!string.IsNullOrEmpty(therapistUserId))
                {
                    var therapistPayload = new
                    {
                        sessionId = s.Id,
                        status = "PendingRelieverAcceptance",
                        message = "Reliever proposal sent. Waiting for reliever acceptance.",
                        relieverTherapistId = s.RelieverTherapistId,
                        proposedRescheduleStartAt = s.ProposedRescheduleStartAt,
                        proposedRescheduleEndAt = s.ProposedRescheduleEndAt
                    };
                    await _realtimeNotifier.SendToUserAsync(RealtimeHub.Sessions, therapistUserId, SignalREvents.RelieverProposalSent, therapistPayload);
                }
            }
            else if (s.Status == SessionStatus.PendingRescheduleApproval)
            {
                // Direct reschedule proposal to patient (no reliever involved)
                var cancellationPayload = new
                {
                    sessionId = s.Id,
                    cancelledBy = isTherapist ? "therapist" : "patient",
                    cancelledByUserId = userId,
                    patientUserId = patientUserId,
                    therapistUserId = therapistUserId,
                    patientName = s.Patient != null ? NameUtils.FullName(s.Patient.FirstName, s.Patient.LastName) : null,
                    therapistName = s.PhysicalTherapist != null ? NameUtils.FullName(s.PhysicalTherapist.User?.FirstName, s.PhysicalTherapist.User?.LastName) : null,
                    cancellationReason = s.CancellationReason,
                    startAt = s.StartAt,
                    status = s.Status.ToString(),
                    proposedRescheduleStartAt = s.ProposedRescheduleStartAt,
                    proposedRescheduleEndAt = s.ProposedRescheduleEndAt,
                    rescheduleProposalReason = s.RescheduleProposalReason,
                    relieverTherapistId = s.RelieverTherapistId,
                    relieverSubstitutionReason = s.RelieverSubstitutionReason,
                    isRelieverProposed = s.IsRelieverProposed
                };

                // Notify both therapist and patient
                var userIds = new List<string>();
                if (!string.IsNullOrEmpty(patientUserId)) userIds.Add(patientUserId);
                if (!string.IsNullOrEmpty(therapistUserId)) userIds.Add(therapistUserId);

                if (userIds.Count > 0)
                {
                    await _realtimeNotifier.SendToUsersAsync(RealtimeHub.Sessions, userIds, SignalREvents.RescheduleProposed, cancellationPayload);
                }
            }
            else if (s.Status == SessionStatus.Cancelled)
            {
                // Session was cancelled outright
                var cancellationPayload = new
                {
                    sessionId = s.Id,
                    cancelledBy = isTherapist ? "therapist" : "patient",
                    cancelledByUserId = userId,
                    patientUserId = patientUserId,
                    therapistUserId = therapistUserId,
                    patientName = s.Patient != null ? NameUtils.FullName(s.Patient.FirstName, s.Patient.LastName) : null,
                    therapistName = s.PhysicalTherapist != null ? NameUtils.FullName(s.PhysicalTherapist.User?.FirstName, s.PhysicalTherapist.User?.LastName) : null,
                    cancellationReason = s.CancellationReason,
                    startAt = s.StartAt,
                    status = s.Status.ToString()
                };

                // Notify both therapist and patient
                var userIds = new List<string>();
                if (!string.IsNullOrEmpty(patientUserId)) userIds.Add(patientUserId);
                if (!string.IsNullOrEmpty(therapistUserId)) userIds.Add(therapistUserId);

                if (userIds.Count > 0)
                {
                    await _realtimeNotifier.SendToUsersAsync(RealtimeHub.Sessions, userIds, SignalREvents.SessionCancelled, cancellationPayload);
                }
            }

            var message = s.Status == SessionStatus.PendingRelieverAcceptance
                ? "Reliever proposal sent. Waiting for reliever acceptance."
                : s.Status == SessionStatus.PendingRescheduleApproval
                    ? "Reschedule proposal sent to patient"
                    : "Session cancelled";
            return new SessionActionResult(200, new { message });
        }

        // PUT: /api/sessions/{sessionId}/request-cancellation (body moved from SessionsController.RequestCancellation)
        public async Task<SessionActionResult> RequestCancellationAsync(ClaimsPrincipal user, int sessionId, RequestCancellationRequest body)
        {
            var userId = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId is null) return new SessionActionResult(401, null);
            var guid = Guid.Parse(userId);

            var s = await _db.TherapySessions
                .Include(x => x.Patient)
                .Include(x => x.PhysicalTherapist)
                .FirstOrDefaultAsync(x => x.Id == sessionId);
            if (s is null) return new SessionActionResult(404, null);

            var isPatient = s.Patient?.UserId == guid;
            if (!isPatient && !user.IsInRole("Admin")) return new SessionActionResult(403, null);

            if (s.Status == SessionStatus.Completed)
                return new SessionActionResult(400, "Cannot cancel a completed session");

            if (s.Status == SessionStatus.Cancelled)
                return new SessionActionResult(400, "Session is already cancelled");

            s.Status = SessionStatus.PendingCancellation;
            s.PatientCancellationReason = string.IsNullOrWhiteSpace(body?.Reason) ? null : body!.Reason!.Trim();
            s.CancellationRequestedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();

            // Notify therapist via SignalR
            var patientUserId = s.Patient?.UserId.ToString();
            var therapistUserId = s.PhysicalTherapist?.UserId.ToString();

            var payload = new
            {
                sessionId = s.Id,
                status = "PendingCancellation",
                patientUserId = patientUserId,
                therapistUserId = therapistUserId,
                patientName = s.Patient != null ? NameUtils.FullName(s.Patient.FirstName, s.Patient.LastName) : null,
                therapistName = s.PhysicalTherapist != null ? NameUtils.FullName(s.PhysicalTherapist.User?.FirstName, s.PhysicalTherapist.User?.LastName) : null,
                patientCancellationReason = s.PatientCancellationReason,
                startAt = s.StartAt
            };

            var userIds = new List<string>();
            if (!string.IsNullOrEmpty(patientUserId)) userIds.Add(patientUserId);
            if (!string.IsNullOrEmpty(therapistUserId)) userIds.Add(therapistUserId);

            if (userIds.Count > 0)
            {
                await _realtimeNotifier.SendToUsersAsync(RealtimeHub.Sessions, userIds, SignalREvents.CancellationRequested, payload);
            }

            return new SessionActionResult(200, new { message = "Cancellation request submitted" });
        }

        // PUT: /api/sessions/{sessionId}/acknowledge-cancellation (body moved from SessionsController.AcknowledgeCancellation)
        public async Task<SessionActionResult> AcknowledgeCancellationAsync(ClaimsPrincipal user, int sessionId, AcknowledgeCancellationRequest body)
        {
            var userId = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId is null) return new SessionActionResult(401, null);
            var guid = Guid.Parse(userId);

            var s = await _db.TherapySessions
                .Include(x => x.Patient)
                .Include(x => x.PhysicalTherapist)
                .FirstOrDefaultAsync(x => x.Id == sessionId);
            if (s is null) return new SessionActionResult(404, null);

            var isTherapist = s.PhysicalTherapist?.UserId == guid;
            if (!isTherapist && !user.IsInRole("Admin")) return new SessionActionResult(403, null);

            if (s.Status != SessionStatus.PendingCancellation)
                return new SessionActionResult(400, "Session is not pending cancellation");

            // Parse reschedule dates if provided
            DateTime? rescheduleStart = null;
            DateTime? rescheduleEnd = null;
            if (!string.IsNullOrWhiteSpace(body?.RescheduleStartAt) && !string.IsNullOrWhiteSpace(body?.RescheduleEndAt))
            {
                if (DateTime.TryParse(body.RescheduleStartAt, out var parsedStart) && DateTime.TryParse(body.RescheduleEndAt, out var parsedEnd))
                {
                    rescheduleStart = DateTimeUtils.NormalizeToUtc(parsedStart);
                    rescheduleEnd = DateTimeUtils.NormalizeToUtc(parsedEnd);
                }
            }

            string eventName;
            string message;

            if (rescheduleStart.HasValue && rescheduleEnd.HasValue)
            {
                // Therapist proposes reschedule instead of cancelling
                if (rescheduleEnd <= rescheduleStart)
                    return new SessionActionResult(400, "Proposed end time must be after start time");

                if (rescheduleStart <= DateTime.UtcNow)
                    return new SessionActionResult(400, "Proposed start time must be in the future");

                s.Status = SessionStatus.PendingRescheduleApproval;
                s.ProposedRescheduleStartAt = rescheduleStart;
                s.ProposedRescheduleEndAt = rescheduleEnd;
                s.RescheduleProposalReason = s.PatientCancellationReason; // Use patient's reason as context
                s.RescheduleProposedAt = DateTime.UtcNow;
                eventName = SignalREvents.RescheduleProposed;
                message = "Reschedule proposal sent to patient";
            }
            else
            {
                // Finalize the cancellation
                s.Status = SessionStatus.Cancelled;
                s.CancelledAt = DateTime.UtcNow;
                s.CancelledBy = CancellationInitiator.Patient; // Original request was from patient
                s.CancellationReason = s.PatientCancellationReason;
                eventName = SignalREvents.SessionCancelled;
                message = "Cancellation approved";
            }

            await _db.SaveChangesAsync();

            // Notify both parties via SignalR
            var patientUserId = s.Patient?.UserId.ToString();
            var therapistUserId = s.PhysicalTherapist?.UserId.ToString();

            var payload = new
            {
                sessionId = s.Id,
                status = s.Status.ToString(),
                patientUserId = patientUserId,
                therapistUserId = therapistUserId,
                patientName = s.Patient != null ? NameUtils.FullName(s.Patient.FirstName, s.Patient.LastName) : null,
                therapistName = s.PhysicalTherapist != null ? NameUtils.FullName(s.PhysicalTherapist.User?.FirstName, s.PhysicalTherapist.User?.LastName) : null,
                patientCancellationReason = s.PatientCancellationReason,
                cancellationReason = s.CancellationReason,
                proposedRescheduleStartAt = s.ProposedRescheduleStartAt,
                proposedRescheduleEndAt = s.ProposedRescheduleEndAt
            };

            var userIds = new List<string>();
            if (!string.IsNullOrEmpty(patientUserId)) userIds.Add(patientUserId);
            if (!string.IsNullOrEmpty(therapistUserId)) userIds.Add(therapistUserId);

            if (userIds.Count > 0)
            {
                await _realtimeNotifier.SendToUsersAsync(RealtimeHub.Sessions, userIds, eventName, payload);
            }

            return new SessionActionResult(200, new { message });
        }

        // PUT: /api/sessions/{sessionId}/approve-reschedule (body moved from SessionsController.ApproveReschedule)
        public async Task<SessionActionResult> ApproveRescheduleAsync(ClaimsPrincipal user, int sessionId)
        {
            var userId = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId is null) return new SessionActionResult(401, null);
            var guid = Guid.Parse(userId);

            var s = await _db.TherapySessions
                .Include(x => x.Patient)
                .Include(x => x.PhysicalTherapist).ThenInclude(t => t!.User)
                .Include(x => x.Contract)
                .FirstOrDefaultAsync(x => x.Id == sessionId);
            if (s is null) return new SessionActionResult(404, null);

            var isPatient = s.Patient?.UserId == guid;
            if (!isPatient && !user.IsInRole("Admin")) return new SessionActionResult(403, null);

            if (s.Status != SessionStatus.PendingRescheduleApproval)
                return new SessionActionResult(400, "Session is not pending reschedule approval");

            if (!s.ProposedRescheduleStartAt.HasValue || !s.ProposedRescheduleEndAt.HasValue)
                return new SessionActionResult(400, "No reschedule proposal found");

            var proposedStartAtUtc = DateTimeUtils.NormalizeToUtc(s.ProposedRescheduleStartAt.Value);
            var proposedEndAtUtc = DateTimeUtils.NormalizeToUtc(s.ProposedRescheduleEndAt.Value);
            if (proposedEndAtUtc <= proposedStartAtUtc)
                return new SessionActionResult(400, "Proposed end time must be after start time");
            if (proposedStartAtUtc <= DateTime.UtcNow)
                return new SessionActionResult(400, "Proposed start time must be in the future");

            // Store original values for notification
            var originalStartAt = s.StartAt;
            var originalEndAt = s.EndAt;
            var originalTherapistId = s.PhysicalTherapistId;
            var originalTherapistName = s.PhysicalTherapist != null
                ? NameUtils.FullName(s.PhysicalTherapist.User?.FirstName, s.PhysicalTherapist.User?.LastName)
                : null;

            // Track if a reliever is being applied
            var relieverWasApplied = false;
            int? newTherapistId = null;
            string? newTherapistName = null;

            PhysicalTherapist? relieverTherapistForApproval = null;
            var effectiveTherapistIdForApproval = s.PhysicalTherapistId;

            // If reliever was proposed, swap the therapist for this session only
            if (s.IsRelieverProposed && s.RelieverTherapistId.HasValue)
            {
                // Get the reliever therapist details
                relieverTherapistForApproval = await _db.PhysicalTherapists
                    .Include(t => t.User)
                    .FirstOrDefaultAsync(t => t.Id == s.RelieverTherapistId.Value);

                if (relieverTherapistForApproval == null)
                    return new SessionActionResult(400, "Reliever therapist not found");

                effectiveTherapistIdForApproval = relieverTherapistForApproval.Id;
            }

            var hasTherapistOverlap = await _db.TherapySessions
              .AsNoTracking()
              .Where(SessionQueries.Overlaps(effectiveTherapistIdForApproval, proposedStartAtUtc, proposedEndAtUtc, s.Id))
              .AnyAsync();

            if (hasTherapistOverlap)
            {
                return new SessionActionResult(400, new { message = "The proposed time conflicts with another session." });
            }

            if (relieverTherapistForApproval != null)
            {
                // Swap the therapist for this session
                s.PhysicalTherapistId = relieverTherapistForApproval.Id;
                s.PhysicalTherapist = relieverTherapistForApproval;
                newTherapistId = relieverTherapistForApproval.Id;
                newTherapistName = NameUtils.FullName(relieverTherapistForApproval.User?.FirstName, relieverTherapistForApproval.User?.LastName);
                relieverWasApplied = true;

                // Clear reliever proposal fields (they've been applied)
                s.RelieverTherapistId = null;
                s.RelieverSubstitutionReason = null;
                s.IsRelieverProposed = false;
            }

            // Apply the proposed reschedule
            s.StartAt = proposedStartAtUtc;
            s.EndAt = proposedEndAtUtc;
            s.DurationMinutes = (int)Math.Round((s.EndAt - s.StartAt).TotalMinutes);
            s.Status = SessionStatus.Scheduled;
            s.IsRescheduled = true;
            s.RescheduledAt = DateTime.UtcNow;

            // Clear proposal fields
            s.ProposedRescheduleStartAt = null;
            s.ProposedRescheduleEndAt = null;
            s.RescheduleProposalReason = null;
            s.RescheduleProposedAt = null;

            await _db.SaveChangesAsync();

            // Notify both parties via SignalR (include original therapist if reliever was applied)
            var patientUserId = s.Patient?.UserId.ToString();
            var currentTherapistUserId = s.PhysicalTherapist?.UserId.ToString();

            // Build list of users to notify (patient + current therapist + original therapist if different)
            var userIds = new List<string>();
            if (!string.IsNullOrEmpty(patientUserId)) userIds.Add(patientUserId);
            if (!string.IsNullOrEmpty(currentTherapistUserId)) userIds.Add(currentTherapistUserId);

            // If reliever was applied, also notify the original therapist
            if (relieverWasApplied && originalTherapistId != s.PhysicalTherapistId)
            {
                var originalTherapist = await _db.PhysicalTherapists
                    .FirstOrDefaultAsync(t => t.Id == originalTherapistId);
                if (originalTherapist != null)
                {
                    var originalTherapistUserId = originalTherapist.UserId.ToString();
                    if (!userIds.Contains(originalTherapistUserId))
                        userIds.Add(originalTherapistUserId);
                }
            }

            var payload = new
            {
                sessionId = s.Id,
                status = "Rescheduled",
                isRescheduled = true,
                rescheduledAt = s.RescheduledAt,
                patientUserId = patientUserId,
                therapistUserId = currentTherapistUserId,
                patientName = s.Patient != null ? NameUtils.FullName(s.Patient.FirstName, s.Patient.LastName) : null,
                therapistName = s.PhysicalTherapist != null ? NameUtils.FullName(s.PhysicalTherapist.User?.FirstName, s.PhysicalTherapist.User?.LastName) : null,
                originalStartAt = originalStartAt,
                originalEndAt = originalEndAt,
                newStartAt = s.StartAt,
                newEndAt = s.EndAt,
                // Reliever-specific fields
                relieverWasApplied = relieverWasApplied,
                originalTherapistId = relieverWasApplied ? originalTherapistId : (int?)null,
                originalTherapistName = relieverWasApplied ? originalTherapistName : null,
                newTherapistId = newTherapistId,
                newTherapistName = newTherapistName
            };

            if (userIds.Count > 0)
            {
                await _realtimeNotifier.SendToUsersAsync(RealtimeHub.Sessions, userIds, SignalREvents.RescheduleApproved, payload);
            }

            // If reliever was applied, send specific notification to the reliever
            if (relieverWasApplied && newTherapistId > 0)
            {
                var relieverTherapist = await _db.PhysicalTherapists
                    .FirstOrDefaultAsync(t => t.Id == newTherapistId);
                if (relieverTherapist != null)
                {
                    var relieverUserId = relieverTherapist.UserId.ToString();
                    var relieverNotification = new
                    {
                        sessionId = s.Id,
                        patientName = s.Patient != null ? NameUtils.FullName(s.Patient.FirstName, s.Patient.LastName) : null,
                        originalTherapistName = originalTherapistName,
                        startAt = s.StartAt,
                        endAt = s.EndAt,
                        status = "Approved",
                        message = "Patient approved! You are now assigned to this session."
                    };
                    await _realtimeNotifier.SendToUserAsync(RealtimeHub.Sessions, relieverUserId, SignalREvents.RelieverApproved, relieverNotification);
                }
            }

            return new SessionActionResult(200, new
            {
                message = relieverWasApplied
                  ? $"Reschedule approved. {newTherapistName} will be your therapist for this session."
                  : "Reschedule approved successfully",
                newStartAt = s.StartAt,
                newEndAt = s.EndAt,
                relieverApplied = relieverWasApplied,
                newTherapistName = newTherapistName
            });
        }

        // PUT: /api/sessions/{sessionId}/decline-reschedule (body moved from SessionsController.DeclineReschedule)
        public async Task<SessionActionResult> DeclineRescheduleAsync(ClaimsPrincipal user, int sessionId, DeclineRescheduleBindingModel? model)
        {
            var userId = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId is null) return new SessionActionResult(401, null);
            var guid = Guid.Parse(userId);

            var s = await _db.TherapySessions
                .Include(x => x.Patient)
                .Include(x => x.PhysicalTherapist)
                .FirstOrDefaultAsync(x => x.Id == sessionId);
            if (s is null) return new SessionActionResult(404, null);

            var isPatient = s.Patient?.UserId == guid;
            if (!isPatient && !user.IsInRole("Admin")) return new SessionActionResult(403, null);

            if (s.Status != SessionStatus.PendingRescheduleApproval)
                return new SessionActionResult(400, "Session is not pending reschedule approval");

            // Store reliever ID before clearing if it exists
            var relieverTherapistId = s.RelieverTherapistId;
            var wasRelieverProposed = s.IsRelieverProposed;

            // Patient is declining the proposed schedule ONLY.
            // Keep the session and revert it to the appropriate prior state.
            var declineReason = model?.Reason?.Trim();

            // If this proposal was created while acknowledging a patient's cancellation request,
            // revert back to PendingCancellation so the therapist can propose another time or finalize.
            // Otherwise, revert back to Scheduled (original schedule remains intact).
            var hasPatientCancellationRequest =
              !string.IsNullOrWhiteSpace(s.PatientCancellationReason)
              || s.CancellationRequestedAt.HasValue;

            s.Status = hasPatientCancellationRequest
              ? SessionStatus.PendingCancellation
              : SessionStatus.Scheduled;

            // Clear proposal fields
            s.ProposedRescheduleStartAt = null;
            s.ProposedRescheduleEndAt = null;
            s.RescheduleProposalReason = null;
            s.RescheduleProposedAt = null;
            s.RelieverTherapistId = null;
            s.RelieverSubstitutionReason = null;
            s.IsRelieverProposed = false;

            await _db.SaveChangesAsync();

            // Notify both parties via SignalR
            var patientUserId = s.Patient?.UserId.ToString();
            var therapistUserId = s.PhysicalTherapist?.UserId.ToString();

            var payload = new
            {
                sessionId = s.Id,
                status = s.Status.ToString(),
                patientUserId = patientUserId,
                therapistUserId = therapistUserId,
                patientName = s.Patient != null ? NameUtils.FullName(s.Patient.FirstName, s.Patient.LastName) : null,
                therapistName = s.PhysicalTherapist != null ? NameUtils.FullName(s.PhysicalTherapist.User?.FirstName, s.PhysicalTherapist.User?.LastName) : null,
                declineReason = string.IsNullOrWhiteSpace(declineReason)
                  ? "Patient declined reschedule proposal"
                  : declineReason
            };

            var userIds = new List<string>();
            if (!string.IsNullOrEmpty(patientUserId)) userIds.Add(patientUserId);
            if (!string.IsNullOrEmpty(therapistUserId)) userIds.Add(therapistUserId);

            if (userIds.Count > 0)
            {
                await _realtimeNotifier.SendToUsersAsync(RealtimeHub.Sessions, userIds, SignalREvents.RescheduleDeclined, payload);
            }

            // If reliever was proposed, notify them that patient declined
            if (wasRelieverProposed && relieverTherapistId.HasValue)
            {
                var relieverTherapist = await _db.PhysicalTherapists
                    .FirstOrDefaultAsync(t => t.Id == relieverTherapistId.Value);
                if (relieverTherapist != null)
                {
                    var relieverUserId = relieverTherapist.UserId.ToString();
                    var relieverPayload = new
                    {
                        sessionId = s.Id,
                        patientName = s.Patient != null ? NameUtils.FullName(s.Patient.FirstName, s.Patient.LastName) : null,
                        status = "Declined",
                        message = "Patient declined the reliever proposal. You are no longer assigned."
                    };
                    await _realtimeNotifier.SendToUserAsync(RealtimeHub.Sessions, relieverUserId, SignalREvents.RelieverDeclined, relieverPayload);
                }
            }

            return new SessionActionResult(200, new { message = "Reschedule declined" });
        }

        // GET: /api/sessions/reliever-proposals (body moved from SessionsController.GetRelieverProposals)
        public async Task<SessionActionResult> GetRelieverProposalsAsync(ClaimsPrincipal user)
        {
            var therapist = await user.GetForCallerAsync(_db);

            // If therapist record doesn't exist, return appropriate response
            if (therapist is null)
            {
                if (user.IsInRole("Admin"))
                {
                    // Admin users without therapist record should see empty list
                    return new SessionActionResult(200, new List<object>());
                }
                return new SessionActionResult(403, null);
            }

            var proposals = await _db.TherapySessions
                .AsNoTracking()
                .Include(s => s.Patient)
                .Include(s => s.PhysicalTherapist).ThenInclude(t => t!.User)
                .Include(s => s.Contract)
                .Where(s => s.RelieverTherapistId == therapist.Id
                         && s.IsRelieverProposed
                         && s.Status == SessionStatus.PendingRelieverAcceptance)
                .OrderBy(s => s.ProposedRescheduleStartAt)
                .Select(s => new
                {
                    id = s.Id,
                    contractId = s.ContractId,
                    patientId = s.PatientId,
                    patientName = s.Patient != null ? $"{s.Patient.FirstName} {s.Patient.LastName}".Trim() : null,
                    originalTherapistId = s.PhysicalTherapistId,
                    originalTherapistName = s.PhysicalTherapist != null ? $"{s.PhysicalTherapist.User!.FirstName} {s.PhysicalTherapist.User.LastName}".Trim() : null,
                    proposedRescheduleStartAt = s.ProposedRescheduleStartAt,
                    proposedRescheduleEndAt = s.ProposedRescheduleEndAt,
                    rescheduleProposalReason = s.RescheduleProposalReason,
                    relieverSubstitutionReason = s.RelieverSubstitutionReason,
                    rescheduleProposedAt = s.RescheduleProposedAt,
                    locationAddress = s.LocationAddress,
                    conditionCase = s.ConditionCase,
                    totalFee = s.TotalFee,
                    status = "PendingRelieverAcceptance"
                })
                .ToListAsync();

            return new SessionActionResult(200, proposals);
        }

        // POST: /api/sessions/{sessionId}/reliever/accept (body moved from SessionsController.AcceptRelieverProposal)
        public async Task<SessionActionResult> AcceptRelieverProposalAsync(ClaimsPrincipal user, int sessionId)
        {
            var therapist = await user.GetForCallerAsync(_db);
            if (therapist is null && !user.IsInRole("Admin"))
                return new SessionActionResult(403, null);

            var s = await _db.TherapySessions
                .Include(x => x.Patient)
                .Include(x => x.PhysicalTherapist).ThenInclude(t => t!.User)
                .FirstOrDefaultAsync(x => x.Id == sessionId);
            if (s is null) return new SessionActionResult(404, null);

            // Verify that this therapist is the proposed reliever
            if (s.RelieverTherapistId != therapist!.Id && !user.IsInRole("Admin"))
                return new SessionActionResult(403, null);

            if (s.Status != SessionStatus.PendingRelieverAcceptance)
                return new SessionActionResult(400, "Session is not pending reliever acceptance");

            if (!s.IsRelieverProposed || !s.RelieverTherapistId.HasValue)
                return new SessionActionResult(400, "No reliever proposal found");

            // Update status to PendingRescheduleApproval - now patient can approve/decline
            s.Status = SessionStatus.PendingRescheduleApproval;
            s.RelieverRespondedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();

            // Notify patient about the reschedule proposal (with reliever therapist)
            var patientUserId = s.Patient?.UserId.ToString();
            var originalTherapistUserId = s.PhysicalTherapist?.UserId.ToString();
            var relieverUserId = therapist.UserId.ToString();

            // Get reliever details for patient notification
            var relieverName = NameUtils.FullName(therapist.User?.FirstName, therapist.User?.LastName);

            // Notify patient
            if (!string.IsNullOrEmpty(patientUserId))
            {
                var patientPayload = new
                {
                    sessionId = s.Id,
                    status = "PendingRescheduleApproval",
                    originalTherapistId = s.PhysicalTherapistId,
                    originalTherapistName = s.PhysicalTherapist != null ? NameUtils.FullName(s.PhysicalTherapist.User?.FirstName, s.PhysicalTherapist.User?.LastName) : null,
                    relieverTherapistId = s.RelieverTherapistId,
                    relieverTherapistName = relieverName,
                    proposedRescheduleStartAt = s.ProposedRescheduleStartAt,
                    proposedRescheduleEndAt = s.ProposedRescheduleEndAt,
                    rescheduleProposalReason = s.RescheduleProposalReason,
                    relieverSubstitutionReason = s.RelieverSubstitutionReason,
                    message = "Your therapist has proposed a reschedule with a substitute therapist."
                };
                await _realtimeNotifier.SendToUserAsync(RealtimeHub.Sessions, patientUserId, SignalREvents.RescheduleProposed, patientPayload);
            }

            // Notify original therapist that reliever accepted
            if (!string.IsNullOrEmpty(originalTherapistUserId))
            {
                var therapistPayload = new
                {
                    sessionId = s.Id,
                    status = "PendingRescheduleApproval",
                    relieverTherapistId = s.RelieverTherapistId,
                    relieverTherapistName = relieverName,
                    message = "Reliever accepted. Waiting for patient approval."
                };
                await _realtimeNotifier.SendToUserAsync(RealtimeHub.Sessions, originalTherapistUserId, SignalREvents.RelieverAccepted, therapistPayload);
            }

            return new SessionActionResult(200, new { message = "Reliever proposal accepted. Patient has been notified." });
        }

        // POST: /api/sessions/{sessionId}/reliever/decline (body moved from SessionsController.DeclineRelieverProposal)
        public async Task<SessionActionResult> DeclineRelieverProposalAsync(ClaimsPrincipal user, int sessionId)
        {
            var therapist = await user.GetForCallerAsync(_db);
            if (therapist is null && !user.IsInRole("Admin"))
                return new SessionActionResult(403, null);

            var s = await _db.TherapySessions
                .Include(x => x.Patient)
                .Include(x => x.PhysicalTherapist).ThenInclude(t => t!.User)
                .FirstOrDefaultAsync(x => x.Id == sessionId);
            if (s is null) return new SessionActionResult(404, null);

            // Verify that this therapist is the proposed reliever
            if (s.RelieverTherapistId != therapist!.Id && !user.IsInRole("Admin"))
                return new SessionActionResult(403, null);

            if (s.Status != SessionStatus.PendingRelieverAcceptance)
                return new SessionActionResult(400, "Session is not pending reliever acceptance");

            // Clear reliever proposal and revert to original status
            // The session should go back to its original state (likely Scheduled or needs cancellation)
            var originalStartAt = s.StartAt;
            s.Status = SessionStatus.Scheduled; // Or handle differently based on requirements
            s.RelieverTherapistId = null;
            s.RelieverSubstitutionReason = null;
            s.IsRelieverProposed = false;
            s.RelieverRespondedAt = DateTime.UtcNow;
            s.RelieverProposedAt = null;

            // Clear reschedule proposal fields since reliever declined
            s.ProposedRescheduleStartAt = null;
            s.ProposedRescheduleEndAt = null;
            s.RescheduleProposalReason = null;
            s.RescheduleProposedAt = null;

            await _db.SaveChangesAsync();

            // Notify original therapist that reliever declined
            var originalTherapistUserId = s.PhysicalTherapist?.UserId.ToString();
            if (!string.IsNullOrEmpty(originalTherapistUserId))
            {
                var relieverName = NameUtils.FullName(therapist.User?.FirstName, therapist.User?.LastName);
                var therapistPayload = new
                {
                    sessionId = s.Id,
                    status = "RelieverDeclined",
                    relieverTherapistName = relieverName,
                    originalStartAt = originalStartAt,
                    message = "Reliever declined the substitution request. Please choose another option."
                };
                await _realtimeNotifier.SendToUserAsync(RealtimeHub.Sessions, originalTherapistUserId, SignalREvents.RelieverDeclined, therapistPayload);
            }

            return new SessionActionResult(200, new { message = "Reliever proposal declined. Original therapist has been notified." });
        }

        // PUT: /api/sessions/{sessionId}/mark-as-done (body moved from SessionsController.MarkAsDone)
        public async Task<SessionActionResult> MarkAsDoneAsync(int sessionId)
        {
            var session = await _db.TherapySessions
                .Include(s => s.Patient)
                .Include(s => s.PhysicalTherapist)
                .FirstOrDefaultAsync(s => s.Id == sessionId);
            if (session == null)
            {
                return new SessionActionResult(404, null);
            }

            session.Status = SessionStatus.DoneForToday;
            await _db.SaveChangesAsync();

            // Notify only the session participants instead of all connected clients
            var userIds = new List<string>();
            var patientUserId = session.Patient?.UserId.ToString();
            var therapistUserId = session.PhysicalTherapist?.UserId.ToString();
            if (!string.IsNullOrEmpty(patientUserId)) userIds.Add(patientUserId);
            if (!string.IsNullOrEmpty(therapistUserId)) userIds.Add(therapistUserId);

            if (userIds.Count > 0)
            {
                await _realtimeNotifier.SendToUsersAsync(RealtimeHub.Sessions, userIds, SignalREvents.SessionMarkedDone, new { sessionId });
            }
            _logger.LogInformation("Sent SessionMarkedDone event for session {SessionId}", sessionId);

            return new SessionActionResult(200, null);
        }

        // POST: /api/sessions/{sessionId}/log-today (body moved from SessionsController.LogTodaySession)
        public async Task<SessionActionResult> LogTodaySessionAsync(int sessionId, LogTodayBindingModel model)
        {
            var session = await _db.TherapySessions.FindAsync(sessionId);
            if (session == null)
            {
                return new SessionActionResult(404, null);
            }

            // Basic validation
            if (model == null)
            {
                return new SessionActionResult(400, "Body is required");
            }

            // Normalize to UTC to match DB column type (timestamp with time zone)
            // Unspecified values are treated as already-UTC by the shared helper, matching the previous local func.
            var startUtc = DateTimeUtils.NormalizeToUtc(model.StartTime);
            var endUtc = DateTimeUtils.NormalizeToUtc(model.EndTime);

            if (endUtc <= startUtc)
            {
                return new SessionActionResult(400, "EndTime must be after StartTime");
            }

            var sessionLog = new SessionLog
            {
                TherapySessionId = sessionId,
                StartTime = startUtc,
                EndTime = endUtc,
                // Store the calendar day in UTC for grouping/sorting
                Date = startUtc.Date
            };

            _db.SessionLogs.Add(sessionLog);
            await _db.SaveChangesAsync();

            var dto = new SessionLogDto
            {
                Id = sessionLog.Id,
                StartTime = sessionLog.StartTime,
                EndTime = sessionLog.EndTime,
                Date = sessionLog.Date
            };

            return new SessionActionResult(200, dto);
        }

        // PUT: /api/sessions/{sessionId}/reschedule (body moved from SessionsController.Reschedule)
        public async Task<SessionActionResult> RescheduleAsync(ClaimsPrincipal user, int sessionId, RescheduleSessionRequest body)
        {
            var userId = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId is null) return new SessionActionResult(401, null);
            var guid = Guid.Parse(userId);

            // Load session with related entities
            var session = await _db.TherapySessions
                .Include(s => s.Patient)
                .Include(s => s.PhysicalTherapist)
                .Include(s => s.Contract)
                .FirstOrDefaultAsync(s => s.Id == sessionId);

            if (session is null)
                return new SessionActionResult(404, new { message = "Session not found" });

            // Authorization: only assigned therapist or admin
            var isTherapist = session.PhysicalTherapist?.UserId == guid;
            if (!isTherapist && !user.IsInRole("Admin"))
                return new SessionActionResult(403, null);

            // Validation 1: Session must be cancelled or cancellation acknowledged
            if (session.Status != SessionStatus.Cancelled && session.Status != SessionStatus.CancellationAcknowledged)
                return new SessionActionResult(400, new { message = "Only cancelled or acknowledged cancelled sessions can be rescheduled" });

            // Validation 2: Contract must still be active
            if (session.Contract != null &&
                (session.Contract.Status == ContractStatus.Completed ||
                 session.Contract.Status == ContractStatus.Terminated ||
                 session.Contract.Status == ContractStatus.Cancelled))
            {
                return new SessionActionResult(400, new { message = "Cannot reschedule session for an ended contract" });
            }

            // Validation 3: New time must be in the future
            var nowUtc = DateTime.UtcNow;
            if (body.NewStartAt <= nowUtc)
                return new SessionActionResult(400, new { message = "New start time must be in the future" });

            if (body.NewEndAt <= body.NewStartAt)
                return new SessionActionResult(400, new { message = "New end time must be after new start time" });

            // Validation 4: Verify the new time is within therapist's weekly availability
            // Convert UTC to Philippine Time (UTC+8) for availability check since availability is stored in local time
            var philippineTimeZone = agapay_backend.Common.ManilaClock.Zone;
            var localStartTime = TimeZoneInfo.ConvertTimeFromUtc(body.NewStartAt.ToUniversalTime(), philippineTimeZone);
            var localEndTime = TimeZoneInfo.ConvertTimeFromUtc(body.NewEndAt.ToUniversalTime(), philippineTimeZone);

            var newDayOfWeek = (DayOfWeekEnum)localStartTime.DayOfWeek;
            var newStartTime = TimeOnly.FromDateTime(localStartTime);
            var newEndTime = TimeOnly.FromDateTime(localEndTime);

            var therapistAvailability = await _db.TherapistAvailabilities
                .AsNoTracking()
                .Where(a => a.PhysicalTherapistId == session.PhysicalTherapistId
                         && a.DayOfWeek == newDayOfWeek
                         && a.IsAvailable)
                .ToListAsync();

            // Check if the requested slot falls within any availability block
            var isWithinAvailability = therapistAvailability.Any(a =>
                newStartTime >= a.StartTime && newEndTime <= a.EndTime);

            if (!isWithinAvailability)
            {
                return new SessionActionResult(400, new { message = "The selected time is not within the therapist's availability" });
            }

            // Validation 5: Check for conflicts with existing sessions (excluding this session)
            var hasConflict = await _db.TherapySessions
                .AsNoTracking()
                .Where(SessionQueries.Overlaps(session.PhysicalTherapistId, body.NewStartAt, body.NewEndAt, sessionId))
                .AnyAsync();

            if (hasConflict)
            {
                return new SessionActionResult(400, new { message = "The selected time conflicts with another session" });
            }

            // Store original times for notification
            var originalStartAt = session.StartAt;
            var originalEndAt = session.EndAt;

            // Update the session
            session.StartAt = body.NewStartAt;
            session.EndAt = body.NewEndAt;
            session.DurationMinutes = (int)Math.Round((body.NewEndAt - body.NewStartAt).TotalMinutes);
            session.Status = SessionStatus.Scheduled;
            session.CancellationReason = null;
            session.CancelledBy = null;
            session.CancelledAt = null;
            session.PatientCancellationReason = null;
            session.CancellationRequestedAt = null;
            session.IsRescheduled = true;
            session.RescheduledAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();

            // Notify the patient via SignalR
            var patientUserId = session.Patient?.UserId.ToString();
            var therapistUserId = session.PhysicalTherapist?.UserId.ToString();

            var reschedulePayload = new
            {
                sessionId = session.Id,
                rescheduledByUserId = userId,
                patientUserId = patientUserId,
                therapistUserId = therapistUserId,
                patientName = session.Patient != null ? NameUtils.FullName(session.Patient.FirstName, session.Patient.LastName) : null,
                therapistName = session.PhysicalTherapist != null ? NameUtils.FullName(session.PhysicalTherapist.User?.FirstName, session.PhysicalTherapist.User?.LastName) : null,
                originalStartAt = originalStartAt,
                originalEndAt = originalEndAt,
                newStartAt = session.StartAt,
                newEndAt = session.EndAt,
                newStatus = session.Status.ToString()
            };

            var userIds = new List<string>();
            if (!string.IsNullOrEmpty(patientUserId)) userIds.Add(patientUserId);
            if (!string.IsNullOrEmpty(therapistUserId)) userIds.Add(therapistUserId);

            if (userIds.Count > 0)
            {
                await _realtimeNotifier.SendToUsersAsync(RealtimeHub.Sessions, userIds, SignalREvents.SessionRescheduled, reschedulePayload);
            }
            _logger.LogInformation("Sent SessionRescheduled event for session {SessionId}", sessionId);

            return new SessionActionResult(200, new
            {
                message = "Session rescheduled successfully",
                sessionId = session.Id,
                newStartAt = session.StartAt,
                newEndAt = session.EndAt,
                status = session.Status.ToString()
            });
        }

        // PUT: /api/contracts/sessions/{sessionId}/start (body moved from ContractsController.StartSession)
        public async Task<SessionActionResult> StartSessionAsync(int sessionId)
        {
            var session = await _db.TherapySessions
                .Include(s => s.Patient)
                .Include(s => s.PhysicalTherapist)
                .FirstOrDefaultAsync(s => s.Id == sessionId);
            if (session == null)
            {
                return new SessionActionResult(404, null);
            }

            session.Status = SessionStatus.InProgress;
            // Note: StartAt should remain the scheduled time, not be overwritten
            // Actual start times are tracked via SessionLog entries

            // Calculate startAtMs for timer synchronization
            // Use the scheduled start time if it's in the past, otherwise use current time
            var nowUtc = DateTime.UtcNow;
            var timerStartTime = session.StartAt <= nowUtc ? session.StartAt : nowUtc;
            var startAtMs = new DateTimeOffset(timerStartTime, TimeSpan.Zero).ToUnixTimeMilliseconds();

            await _db.SaveChangesAsync();

            // Notify only the session participants instead of all connected clients
            var userIds = new List<string>();
            var patientUserId = session.Patient?.UserId.ToString();
            var therapistUserId = session.PhysicalTherapist?.UserId.ToString();
            if (!string.IsNullOrEmpty(patientUserId)) userIds.Add(patientUserId);
            if (!string.IsNullOrEmpty(therapistUserId)) userIds.Add(therapistUserId);

            if (userIds.Count > 0)
            {
                await _realtimeNotifier.SendToUsersAsync(RealtimeHub.Sessions, userIds, SignalREvents.SessionStarted, new { sessionId, startAtMs });
            }
            _logger.LogInformation("Sent SessionStarted event for session {SessionId}", sessionId);

            return new SessionActionResult(200, new { startAtMs });
        }

        // PUT: /api/contracts/sessions/{sessionId}/complete (body moved from ContractsController.CompleteSession)
        public async Task<SessionActionResult> CompleteSessionAsync(int sessionId)
        {
            var session = await _db.TherapySessions
                .Include(s => s.Patient)
                .Include(s => s.PhysicalTherapist)
                .FirstOrDefaultAsync(s => s.Id == sessionId);
            if (session == null)
            {
                return new SessionActionResult(404, null);
            }

            session.Status = SessionStatus.Completed;
            // Note: EndAt should remain the scheduled time, not be overwritten
            // Actual end times are tracked via SessionLog entries

            await _db.SaveChangesAsync();

            // Notify only the session participants instead of all connected clients
            var userIds = new List<string>();
            var patientUserId = session.Patient?.UserId.ToString();
            var therapistUserId = session.PhysicalTherapist?.UserId.ToString();
            if (!string.IsNullOrEmpty(patientUserId)) userIds.Add(patientUserId);
            if (!string.IsNullOrEmpty(therapistUserId)) userIds.Add(therapistUserId);

            if (userIds.Count > 0)
            {
                await _realtimeNotifier.SendToUsersAsync(RealtimeHub.Sessions, userIds, SignalREvents.SessionCompleted, new { sessionId });
            }
            _logger.LogInformation("Sent SessionCompleted event for session {SessionId}", sessionId);

            return new SessionActionResult(200, null);
        }

        /// <summary>
        /// Shared "DoneForToday → Scheduled" reset used by the background services.
        /// When <paramref name="shiftDatesToToday"/> is true (SessionAutoTransitionService's
        /// 5 AM daily-recurrence pass) StartAt/EndAt are moved to today's Manila date while
        /// preserving the time of day, sessions already scheduled for today or later are
        /// skipped, and only sessions on active contracts are reset.
        /// When false (SessionReschedulingService part 1) the dates are left untouched and
        /// only the status flips back to Scheduled.
        /// Returns the number of sessions reset (the caller owns the SessionsRefresh broadcast).
        /// </summary>
        public async Task<int> ResetDoneForTodaySessionsAsync(bool shiftDatesToToday, CancellationToken cancellationToken = default)
        {
            if (shiftDatesToToday)
            {
                // Get today's date in local time
                var philippineTimeZone = agapay_backend.Common.ManilaClock.Zone;
                var localNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, philippineTimeZone);
                var localToday = localNow.Date;

                // Find all DoneForToday sessions where:
                // 1. Status is DoneForToday
                // 2. StartAt date is in the past (before today)
                // 3. Contract is still active (not completed/terminated/cancelled)
                var sessionsToReset = await _db.TherapySessions
                    .Include(s => s.Contract)
                    .Where(s => s.Status == SessionStatus.DoneForToday
                        && s.Contract != null
                        && s.Contract.Status == ContractStatus.Active)
                    .ToListAsync(cancellationToken);

                var resetCount = 0;

                foreach (var session in sessionsToReset)
                {
                    // Convert session StartAt to local time to check if it's a past date
                    var sessionLocalStart = TimeZoneInfo.ConvertTimeFromUtc(session.StartAt, philippineTimeZone);
                    var sessionLocalDate = sessionLocalStart.Date;

                    // Skip if the session is scheduled for today or a future date (already rescheduled to future)
                    if (sessionLocalDate >= localToday)
                    {
                        continue;
                    }

                    // Calculate new StartAt and EndAt for today, keeping the same time
                    var sessionDuration = session.EndAt - session.StartAt;
                    var newLocalStart = localToday.Add(sessionLocalStart.TimeOfDay);
                    var newLocalEnd = newLocalStart.Add(sessionDuration);

                    // Convert back to UTC
                    session.StartAt = TimeZoneInfo.ConvertTimeToUtc(newLocalStart, philippineTimeZone);
                    session.EndAt = TimeZoneInfo.ConvertTimeToUtc(newLocalEnd, philippineTimeZone);
                    session.Status = SessionStatus.Scheduled;

                    resetCount++;

                    _logger.LogInformation($"Session {session.Id} reset for daily recurrence: new schedule {session.StartAt:yyyy-MM-dd HH:mm:ss} - {session.EndAt:yyyy-MM-dd HH:mm:ss} UTC");
                }

                if (resetCount > 0)
                {
                    await _db.SaveChangesAsync(cancellationToken);
                }

                return resetCount;
            }
            else
            {
                var today = DateTime.UtcNow.Date;

                // Reset "DoneForToday" sessions back to "Scheduled" for today's recurring sessions
                var doneForTodaySessions = await _db.TherapySessions
                    .Include(s => s.Contract)
                    .Where(s =>
                        s.Status == SessionStatus.DoneForToday &&
                        s.StartAt.Date < today) // Sessions from before today
                    .ToListAsync(cancellationToken);

                _logger.LogInformation("Found {Count} DoneForToday sessions to reset", doneForTodaySessions.Count);

                int resetCount = 0;
                foreach (var session in doneForTodaySessions)
                {
                    // Check if contract is still active
                    if (session.Contract == null || session.Contract.Status != ContractStatus.Active)
                    {
                        _logger.LogInformation(
                            "Skipping DoneForToday session {SessionId} - contract is not active",
                            session.Id);
                        continue;
                    }

                    session.Status = SessionStatus.Scheduled;
                    resetCount++;

                    _logger.LogInformation(
                        "Reset DoneForToday session {SessionId} back to Scheduled",
                        session.Id);
                }

                if (resetCount > 0)
                {
                    await _db.SaveChangesAsync(cancellationToken);
                }

                return resetCount;
            }
        }
    }
}
