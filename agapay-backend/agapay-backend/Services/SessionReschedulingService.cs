using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Services.Sessions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace agapay_backend.Services
{
    /// <summary>
    /// Background service that runs daily at 5:00 AM to reschedule cancelled sessions.
    /// When a session is cancelled, it only cancels that specific day's appointment.
    /// This service automatically creates a new session for the following week at the same time.
    /// </summary>
    public class SessionReschedulingService : BackgroundService
    {
        private readonly ILogger<SessionReschedulingService> _logger;
        private readonly IServiceScopeFactory _serviceScopeFactory;

        public SessionReschedulingService(
            ILogger<SessionReschedulingService> logger,
            IServiceScopeFactory serviceScopeFactory)
        {
            _logger = logger;
            _serviceScopeFactory = serviceScopeFactory;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Session Rescheduling Service started. Will run daily at 5:00 AM.");

            while (!stoppingToken.IsCancellationRequested)
            {
                var now = DateTime.UtcNow;
                var nextRun = GetNext5AMUtc(now);
                var delay = nextRun - now;

                _logger.LogInformation("Next rescheduling job will run at {NextRun} UTC (in {Hours} hours)",
                    nextRun, delay.TotalHours);

                try
                {
                    await Task.Delay(delay, stoppingToken);
                    await RescheduleCancelledSessions(stoppingToken);
                }
                catch (TaskCanceledException)
                {
                    _logger.LogInformation("Session Rescheduling Service is stopping.");
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error in Session Rescheduling Service");
                }
            }
        }

        private DateTime GetNext5AMUtc(DateTime currentTime)
        {
            var next5AM = currentTime.Date.AddHours(5);

            // If it's already past 5 AM today, schedule for tomorrow
            if (currentTime >= next5AM)
            {
                next5AM = next5AM.AddDays(1);
            }

            return next5AM;
        }

        private async Task RescheduleCancelledSessions(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Starting session rescheduling job...");

            using var scope = _serviceScopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<agapayDbContext>();
            var sessionService = scope.ServiceProvider.GetRequiredService<ISessionService>();

            try
            {
                // First, reset "DoneForToday" sessions back to "Scheduled" for today's recurring sessions
                // (dates are left untouched — only the status flips back to Scheduled)
                var resetCount = await sessionService.ResetDoneForTodaySessionsAsync(shiftDatesToToday: false, stoppingToken);

                if (resetCount > 0)
                {
                    _logger.LogInformation("Successfully reset {Count} DoneForToday sessions to Scheduled", resetCount);
                }

                // Find all cancelled sessions from yesterday or earlier that haven't been rescheduled yet
                var today = DateTime.UtcNow.Date;
                var cancelledSessions = await dbContext.TherapySessions
                    .Include(s => s.Patient)
                    .Include(s => s.PhysicalTherapist)
                    .Include(s => s.Contract)
                    .Where(s =>
                        s.Status == SessionStatus.Cancelled &&
                        !s.IsRescheduled && // Skip sessions already rescheduled in a prior run
                        s.StartAt.Date < today) // Sessions from before today
                    .ToListAsync(stoppingToken);

                _logger.LogInformation("Found {Count} cancelled sessions to process", cancelledSessions.Count);

                int rescheduledCount = 0;

                // Prefetch, in a single query, every existing (non-cancelled) session slot
                // that could collide with a candidate next-week slot. This replaces the
                // per-session AnyAsync duplicate check (N+1) while keeping the exact same
                // predicate: same patient + therapist + start time, excluding cancelled.
                var candidateSessions = cancelledSessions
                    .Where(s => s.Contract != null && s.Contract.Status == ContractStatus.Active)
                    .ToList();
                var candidatePatientIds = candidateSessions.Select(s => s.PatientId).Distinct().ToList();
                var candidateTherapistIds = candidateSessions.Select(s => s.PhysicalTherapistId).Distinct().ToList();
                var candidateStarts = candidateSessions.Select(s => s.StartAt.AddDays(7)).Distinct().ToList();

                var existingCollisions = await dbContext.TherapySessions
                    .AsNoTracking()
                    .Where(s =>
                        candidatePatientIds.Contains(s.PatientId) &&
                        candidateTherapistIds.Contains(s.PhysicalTherapistId) &&
                        candidateStarts.Contains(s.StartAt) &&
                        s.Status != SessionStatus.Cancelled)
                    .Select(s => new { s.PatientId, s.PhysicalTherapistId, s.StartAt })
                    .ToListAsync(stoppingToken);
                var existingSlots = existingCollisions
                    .Select(s => (s.PatientId, s.PhysicalTherapistId, s.StartAt))
                    .ToHashSet();

                foreach (var session in cancelledSessions)
                {
                    try
                    {
                        // Check if contract is still active
                        if (session.Contract == null ||
                            session.Contract.Status != ContractStatus.Active)
                        {
                            _logger.LogInformation(
                                "Skipping session {SessionId} - contract is not active",
                                session.Id);
                            continue;
                        }

                        // Calculate next week's date (same day, same time)
                        var nextWeekStartAt = session.StartAt.AddDays(7);
                        var nextWeekEndAt = session.EndAt.AddDays(7);

                        // Check if a session already exists at this time (avoid duplicates)
                        // using the prefetched collision set (same predicate as before).
                        if (existingSlots.Contains((session.PatientId, session.PhysicalTherapistId, nextWeekStartAt)))
                        {
                            _logger.LogInformation(
                                "Skipping session {SessionId} - session already exists for {NextWeek}",
                                session.Id, nextWeekStartAt);
                            continue;
                        }

                        // Create new rescheduled session
                        var newSession = new TherapySession
                        {
                            PatientId = session.PatientId,
                            PhysicalTherapistId = session.PhysicalTherapistId,
                            ContractId = session.ContractId,
                            LocationAddress = session.LocationAddress,
                            Latitude = session.Latitude,
                            Longitude = session.Longitude,
                            StartAt = nextWeekStartAt,
                            EndAt = nextWeekEndAt,
                            DurationMinutes = session.DurationMinutes,
                            TotalFee = session.TotalFee,
                            PatientFee = session.PatientFee,
                            ProfessionalFee = session.ProfessionalFee,
                            LocationFee = session.LocationFee,
                            MiscellaneousFee = session.MiscellaneousFee,
                            ConditionCase = session.ConditionCase,
                            Status = SessionStatus.Scheduled,
                            SessionNumber = session.SessionNumber,
                            CreatedAt = DateTime.UtcNow
                        };

                        dbContext.TherapySessions.Add(newSession);

                        // Mark the original cancelled session so it is not re-processed on the next run
                        session.IsRescheduled = true;
                        session.RescheduledAt = DateTime.UtcNow;

                        rescheduledCount++;

                        _logger.LogInformation(
                            "Rescheduled session {OriginalSessionId} from {OriginalDate} to {NewDate} for Patient {PatientId} and Therapist {TherapistId}",
                            session.Id,
                            session.StartAt,
                            nextWeekStartAt,
                            session.PatientId,
                            session.PhysicalTherapistId);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex,
                            "Error rescheduling session {SessionId}",
                            session.Id);
                    }
                }

                if (rescheduledCount > 0)
                {
                    await dbContext.SaveChangesAsync(stoppingToken);
                    _logger.LogInformation(
                        "Successfully rescheduled {Count} sessions",
                        rescheduledCount);
                }
                else
                {
                    _logger.LogInformation("No sessions were rescheduled");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during session rescheduling job");
            }
        }
    }
}
