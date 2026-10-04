using System.Security.Claims;
using agapay_backend.Common;
using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Models;
using agapay_backend.Services.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace agapay_backend.Services.Contracts
{
    /// <summary>
    /// Blueprint lifecycle logic extracted verbatim from ContractsController
    /// (send for confirmation, confirm, decline, update, end) plus the session
    /// generator that ConfirmBlueprint runs. Responses are returned as
    /// ContractActionResult records; the controller maps them back to the
    /// original IActionResult types so routes, verbs, status codes and payload
    /// shapes stay byte-identical.
    /// </summary>
    public class ContractBlueprintService : IContractBlueprintService
    {
        private readonly agapayDbContext _db;
        private readonly IRealtimeNotifier _realtimeNotifier;
        private readonly ILogger<ContractBlueprintService> _logger;

        public ContractBlueprintService(agapayDbContext db, IRealtimeNotifier realtimeNotifier, ILogger<ContractBlueprintService> logger)
        {
            _db = db;
            _realtimeNotifier = realtimeNotifier;
            _logger = logger;
        }

        // PUT: /api/contracts/{contractId}/blueprint (body moved from ContractsController.UpdateBlueprint)
        public async Task<ContractActionResult> UpdateBlueprintAsync(ClaimsPrincipal user, int contractId, UpdateContractBlueprintDto dto)
        {
            var me = await user.GetForCallerAsync(_db);

            var contract = await _db.Contracts.FirstOrDefaultAsync(c => c.Id == contractId);
            if (contract == null) return new ContractActionResult(404, null);

            if (!user.IsInRole("Admin"))
            {
                if (me == null || me.Id != contract.PhysicalTherapistId)
                    return new ContractActionResult(403, null);
            }

            if (contract.Status is ContractStatus.Completed or ContractStatus.Cancelled or ContractStatus.Expired or ContractStatus.Terminated)
                return new ContractActionResult(400, new { message = "Cannot modify blueprint for a closed contract" });

            if (!string.IsNullOrWhiteSpace(dto.CaseToTreat)) contract.CaseToTreat = dto.CaseToTreat;
            if (!string.IsNullOrWhiteSpace(dto.SessionDays)) contract.SessionDays = dto.SessionDays;
            if (dto.SessionStartTime.HasValue) contract.SessionStartTime = dto.SessionStartTime.Value;
            if (dto.SessionEndTime.HasValue) contract.SessionEndTime = dto.SessionEndTime.Value;
            if (dto.ProposedSessionDate.HasValue) contract.ProposedSessionDate = dto.ProposedSessionDate.Value;

            if (dto.ProfessionalFee.HasValue) contract.ProfessionalFee = dto.ProfessionalFee.Value;
            if (dto.LocationFee.HasValue) contract.LocationFee = dto.LocationFee.Value;
            if (dto.MiscellaneousFee.HasValue) contract.MiscellaneousFee = dto.MiscellaneousFee.Value;

            if (dto.TotalFee.HasValue)
                contract.TotalFee = dto.TotalFee.Value;
            else if (dto.ProfessionalFee.HasValue || dto.LocationFee.HasValue || dto.MiscellaneousFee.HasValue)
                contract.TotalFee = (contract.ProfessionalFee ?? 0) + (contract.LocationFee ?? 0) + (contract.MiscellaneousFee ?? 0);

            await _db.SaveChangesAsync();
            return new ContractActionResult(200, new { message = "Blueprint updated" });
        }

        // POST: /api/contracts/{contractId}/send-for-confirmation (body moved from ContractsController.SendBlueprintForConfirmation)
        public async Task<ContractActionResult> SendBlueprintForConfirmationAsync(ClaimsPrincipal user, int contractId)
        {
            var me = await user.GetForCallerAsync(_db);

            var contract = await _db.Contracts.FirstOrDefaultAsync(c => c.Id == contractId);
            if (contract == null) return new ContractActionResult(404, null);

            if (!user.IsInRole("Admin"))
            {
                if (me == null || me.Id != contract.PhysicalTherapistId)
                    return new ContractActionResult(403, null);
            }

            if (contract.Status is ContractStatus.Completed or ContractStatus.Cancelled or ContractStatus.Expired or ContractStatus.Terminated)
                return new ContractActionResult(400, new { message = "Contract is closed" });

            contract.Status = ContractStatus.PendingConfirmation;
            contract.BlueprintProposedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            // Notify patient in real-time
            var patient = await _db.Patients.AsNoTracking().FirstOrDefaultAsync(p => p.Id == contract.PatientId);
            var therapist = await _db.PhysicalTherapists.AsNoTracking().Include(t => t.User).FirstOrDefaultAsync(t => t.Id == contract.PhysicalTherapistId);
            if (patient != null)
            {
                await _realtimeNotifier.SendToUserAsync(RealtimeHub.Contracts, patient.UserId.ToString(), SignalREvents.ContractPending, new
                {
                    contractId = contract.Id,
                    therapistId = contract.PhysicalTherapistId,
                    therapistName = therapist != null ? NameUtils.FullName(therapist.User.FirstName, therapist.User.LastName) : null,
                    caseToTreat = contract.CaseToTreat,
                    sessionDays = contract.SessionDays,
                    sessionStartTime = contract.SessionStartTime?.ToString(),
                    sessionEndTime = contract.SessionEndTime?.ToString(),
                    totalFee = contract.TotalFee,
                    proposedAt = contract.BlueprintProposedAt,
                });
            }

            return new ContractActionResult(200, new { message = "Blueprint sent for confirmation" });
        }

        // POST: /api/contracts/{contractId}/confirm (body moved from ContractsController.ConfirmBlueprint)
        public async Task<ContractActionResult> ConfirmBlueprintAsync(ClaimsPrincipal user, int contractId)
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userId == null) return new ContractActionResult(401, null);
            var me = await _db.Patients.FirstOrDefaultAsync(p => p.UserId == Guid.Parse(userId));

            var contract = await _db.Contracts.FirstOrDefaultAsync(c => c.Id == contractId);
            if (contract == null) return new ContractActionResult(404, null);

            if (!user.IsInRole("Admin"))
            {
                if (me == null || me.Id != contract.PatientId)
                    return new ContractActionResult(403, null);
            }

            if (contract.Status != ContractStatus.PendingConfirmation)
                return new ContractActionResult(400, new { message = "Contract is not awaiting confirmation" });

            var confirmedAt = DateTime.UtcNow;
            contract.Status = ContractStatus.Active;
            contract.BlueprintConfirmedAt = confirmedAt;
            // Preserve the existing StartDate if the therapist already set a schedule. Only fall back to now when blank.
            if (contract.StartDate == default)
            {
                contract.StartDate = confirmedAt;
            }
            // Open-ended contract until completed/terminated
            contract.EndDate = null;

            await _db.SaveChangesAsync();

            var sessionsCreated = await GenerateSessionsForContractAsync(contract, confirmedAt);
            _logger.LogInformation("Contract {ContractId} confirmed. Generated {SessionsCreated} session(s)", contract.Id, sessionsCreated);

            // Notify therapist in real-time
            var therapist = await _db.PhysicalTherapists.AsNoTracking().Include(t => t.User).FirstOrDefaultAsync(t => t.Id == contract.PhysicalTherapistId);
            var patient = await _db.Patients.AsNoTracking().Include(p => p.User).FirstOrDefaultAsync(p => p.Id == contract.PatientId);
            if (therapist != null)
            {
                await _realtimeNotifier.SendToUserAsync(RealtimeHub.Contracts, therapist.UserId.ToString(), SignalREvents.ContractActivated, new
                {
                    contractId = contract.Id,
                    patientId = contract.PatientId,
                    patientName = patient != null ? NameUtils.FullName(patient.FirstName, patient.LastName) : null,
                    confirmedAt = contract.BlueprintConfirmedAt,
                    startDate = contract.StartDate,
                    sessionsCreated,
                });
            }
            if (patient?.User != null)
            {
                await _realtimeNotifier.SendToUserAsync(RealtimeHub.Contracts, patient.UserId.ToString(), SignalREvents.ContractActivated, new
                {
                    contractId = contract.Id,
                    patientId = contract.PatientId,
                    patientName = patient != null ? NameUtils.FullName(patient.FirstName, patient.LastName) : null,
                    confirmedAt = contract.BlueprintConfirmedAt,
                    startDate = contract.StartDate,
                    sessionsCreated,
                });
            }

            return new ContractActionResult(200, new { message = "Contract confirmed and activated", sessionsCreated });
        }

        // POST: /api/contracts/{contractId}/decline (body moved from ContractsController.DeclineBlueprint)
        public async Task<ContractActionResult> DeclineBlueprintAsync(ClaimsPrincipal user, int contractId)
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userId == null) return new ContractActionResult(401, null);
            var me = await _db.Patients.FirstOrDefaultAsync(p => p.UserId == Guid.Parse(userId));

            var contract = await _db.Contracts.FirstOrDefaultAsync(c => c.Id == contractId);
            if (contract == null) return new ContractActionResult(404, null);

            if (!user.IsInRole("Admin"))
            {
                if (me == null || me.Id != contract.PatientId)
                    return new ContractActionResult(403, null);
            }

            if (contract.Status != ContractStatus.PendingConfirmation)
                return new ContractActionResult(400, new { message = "Contract is not awaiting confirmation" });

            contract.Status = ContractStatus.Draft;
            contract.BlueprintProposedAt = null;
            contract.BlueprintConfirmedAt = null;

            await _db.SaveChangesAsync();

            var therapist = await _db.PhysicalTherapists.AsNoTracking().Include(t => t.User).FirstOrDefaultAsync(t => t.Id == contract.PhysicalTherapistId);
            var patient = await _db.Patients.AsNoTracking().Include(p => p.User).FirstOrDefaultAsync(p => p.Id == contract.PatientId);

            var recipients = new List<string>();
            if (therapist?.User != null)
                recipients.Add(therapist.UserId.ToString());
            if (patient?.User != null)
                recipients.Add(patient.UserId.ToString());

            if (recipients.Count > 0)
            {
                string? patientName = patient != null
                  ? $"{(patient.FirstName ?? patient.User?.FirstName ?? string.Empty).Trim()} {(patient.LastName ?? patient.User?.LastName ?? string.Empty).Trim()}".Trim()
                  : null;
                if (string.IsNullOrWhiteSpace(patientName))
                {
                    patientName = patient?.User?.Email;
                }
                if (string.IsNullOrWhiteSpace(patientName))
                {
                    patientName = null;
                }

                await _realtimeNotifier.SendToUsersAsync(RealtimeHub.Contracts, recipients, SignalREvents.ContractDeclined, new
                {
                    contractId = contract.Id,
                    patientId = contract.PatientId,
                    therapistId = contract.PhysicalTherapistId,
                    patientName,
                    declinedAt = DateTime.UtcNow
                });
            }

            return new ContractActionResult(200, new { message = "Contract declined" });
        }

        // POST: /api/contracts/{contractId}/end (body moved from ContractsController.EndContract)
        public async Task<ContractActionResult> EndContractAsync(ClaimsPrincipal user, int contractId, EndContractDto dto)
        {
            var me = await user.GetForCallerAsync(_db);

            var contract = await _db.Contracts.FirstOrDefaultAsync(c => c.Id == contractId);
            if (contract == null) return new ContractActionResult(404, null);

            if (!user.IsInRole("Admin"))
            {
                if (me == null || me.Id != contract.PhysicalTherapistId)
                    return new ContractActionResult(403, null);
            }

            if (contract.Status != ContractStatus.Active)
                return new ContractActionResult(400, new { message = "Contract is not active" });

            // Validate the status
            if (dto.Status != ContractStatus.Completed && dto.Status != ContractStatus.Terminated)
                return new ContractActionResult(400, new { message = "Contract can only be ended with Completed or Terminated status" });

            contract.Status = dto.Status;
            contract.EndDate = DateTime.UtcNow;
            contract.ContractEndReason = dto.Reason;
            contract.ContractEndedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            // Notify patient in real-time
            var patient = await _db.Patients.AsNoTracking().Include(p => p.User).FirstOrDefaultAsync(p => p.Id == contract.PatientId);
            if (patient != null)
            {
                await _realtimeNotifier.SendToUserAsync(RealtimeHub.Contracts, patient.UserId.ToString(), SignalREvents.ContractEnded, new
                {
                    contractId = contract.Id,
                    status = contract.Status.ToString(),
                    endedAt = contract.EndDate,
                    reason = contract.ContractEndReason,
                });
            }

            return new ContractActionResult(200, new { message = $"Contract marked as {dto.Status}" });
        }

        // Moved verbatim from ContractsController.GenerateSessionsForContractAsync (called by ConfirmBlueprint)
        private async Task<int> GenerateSessionsForContractAsync(Contract contract, DateTime confirmedAt)
        {
            _logger.LogInformation("Generating sessions for contract {ContractId}", contract.Id);

            if (string.IsNullOrWhiteSpace(contract.SessionDays) ||
                contract.SessionStartTime is null ||
                contract.SessionEndTime is null)
            {
                _logger.LogWarning("Cannot generate sessions for contract {ContractId}: missing blueprint fields", contract.Id);
                return 0;
            }

            await _db.Entry(contract).Collection(c => c.Sessions).LoadAsync();
            if (contract.Sessions.Any())
            {
                // Sessions already generated; avoid duplicates
                _logger.LogInformation("Sessions already exist for contract {ContractId}, skipping generation", contract.Id);
                return 0;
            }

            var patient = await _db.Patients.AsNoTracking().FirstOrDefaultAsync(p => p.Id == contract.PatientId);
            if (patient is null)
            {
                _logger.LogWarning("Cannot generate sessions for contract {ContractId}: Patient {PatientId} not found", contract.Id, contract.PatientId);
                return 0;
            }

            var dayTokens = contract.SessionDays
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(SessionDaysParser.ParseDayOfWeek)
                .Where(d => d.HasValue)
                .Select(d => d!.Value)
                .Distinct()
                .OrderBy(d => d)
                .ToList();

            _logger.LogDebug("Parsed day tokens for contract {ContractId}: [{DayTokens}]", contract.Id, string.Join(", ", dayTokens));

            if (!dayTokens.Any())
            {
                _logger.LogWarning("No valid day tokens parsed for contract {ContractId}", contract.Id);
                return 0;
            }

            var startTime = contract.SessionStartTime.Value;
            var endTime = contract.SessionEndTime.Value;
            var duration = SessionDaysParser.CalculateDurationMinutes(startTime, endTime);
            if (duration <= 0)
            {
                _logger.LogWarning("Invalid duration for contract {ContractId}: {Duration}min", contract.Id, duration);
                return 0;
            }

            var totalFee = contract.TotalFee ?? ((contract.ProfessionalFee ?? 0) + (contract.LocationFee ?? 0) + (contract.MiscellaneousFee ?? 0));
            var startDate = contract.StartDate == default ? confirmedAt : contract.StartDate;

            var locationAddress = !string.IsNullOrWhiteSpace(patient.Address) && !string.IsNullOrWhiteSpace(patient.Barangay)
                ? $"{patient.Address}, {patient.Barangay}"
                : (!string.IsNullOrWhiteSpace(patient.Address) ? patient.Address : patient.Barangay);

            // Determine the session start time
            // Priority 1: Use ProposedSessionDate if set (exact date proposed by therapist)
            // Priority 2: Parse date from SessionDays string (e.g., "Saturday (Dec 13)")
            // Priority 3: Calculate from day of week (legacy behavior)
            DateTime firstOccurrence;
            if (contract.ProposedSessionDate.HasValue)
            {
                // Use the exact proposed date with the start time
                firstOccurrence = SessionDaysParser.Combine(contract.ProposedSessionDate.Value, startTime);
                _logger.LogDebug("Using ProposedSessionDate for contract {ContractId}: {SessionDate}", contract.Id, firstOccurrence);
            }
            else
            {
                // Try to extract exact date from SessionDays (e.g., "Saturday (Dec 13)")
                var parsedDate = SessionDaysParser.ParseDateFromSessionDays(contract.SessionDays);
                if (parsedDate.HasValue)
                {
                    // Use the parsed date with the start time
                    firstOccurrence = SessionDaysParser.Combine(parsedDate.Value, startTime);
                    _logger.LogDebug("Parsed date from SessionDays for contract {ContractId}: {SessionDate}", contract.Id, firstOccurrence);
                }
                else
                {
                    // Fallback: Find the earliest session day from the available days
                    firstOccurrence = dayTokens
                        .Select(day => SessionDaysParser.GetFirstOccurrence(startDate, day, startTime, confirmedAt))
                        .OrderBy(dt => dt)
                        .First();
                    _logger.LogDebug("Using calculated first occurrence for contract {ContractId}: {SessionDate}", contract.Id, firstOccurrence);
                }
            }

            // Create only the first session
            var session = new TherapySession
            {
                PatientId = contract.PatientId,
                PhysicalTherapistId = contract.PhysicalTherapistId,
                ContractId = contract.Id,
                LocationAddress = locationAddress,
                Latitude = patient.Latitude,
                Longitude = patient.Longitude,
                StartAt = firstOccurrence,
                EndAt = firstOccurrence.AddMinutes(duration),
                DurationMinutes = duration,
                DoctorReferralImageUrl = null,
                TotalFee = totalFee,
                PatientFee = totalFee,
                ProfessionalFee = contract.ProfessionalFee,
                LocationFee = contract.LocationFee,
                MiscellaneousFee = contract.MiscellaneousFee,
                ConditionCase = contract.CaseToTreat,
                Status = SessionStatus.Scheduled,
                SessionNumber = 1,
                DetailsProposedAt = contract.BlueprintProposedAt,
                DetailsConfirmedAt = confirmedAt,
            };

            await _db.TherapySessions.AddAsync(session);
            await _db.SaveChangesAsync();

            // Broadcast SessionCreated event to therapist so their schedule updates in real-time
            // This ensures the time slot immediately shows as booked when patient accepts
            var therapist = await _db.PhysicalTherapists
                .AsNoTracking()
                .Include(t => t.User)
                .FirstOrDefaultAsync(t => t.Id == contract.PhysicalTherapistId);

            if (therapist != null)
            {
                var payload = new
                {
                    sessionId = session.Id,
                    therapistId = session.PhysicalTherapistId,
                    patientId = session.PatientId,
                    startAt = session.StartAt,
                    endAt = session.EndAt,
                    status = session.Status.ToString(),
                    message = "A new session has been created from contract confirmation."
                };
                await _realtimeNotifier.SendToUserAsync(RealtimeHub.Sessions, therapist.UserId.ToString(), SignalREvents.SessionCreated, payload);
                _logger.LogInformation("Sent SessionCreated event to therapist {TherapistUserId} for session {SessionId}", therapist.UserId, session.Id);
            }

            return 1; // Only one session created
        }
    }
}
