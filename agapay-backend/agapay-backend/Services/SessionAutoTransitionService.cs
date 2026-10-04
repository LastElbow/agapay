using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Hubs;
using agapay_backend.Services.Sessions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace agapay_backend.Services
{
    /// <summary>
    /// Background service that automatically manages session lifecycle:
    /// 1. Transitions scheduled sessions to InProgress when start time arrives
    /// 2. Transitions InProgress sessions to DoneForToday when end time passes
    /// 3. Resets DoneForToday sessions to Scheduled at 5 AM for daily recurrence
    /// </summary>
    public class SessionAutoTransitionService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<SessionAutoTransitionService> _logger;
        private readonly TimeSpan _checkInterval = TimeSpan.FromMinutes(1);

        public SessionAutoTransitionService(IServiceProvider serviceProvider, ILogger<SessionAutoTransitionService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("SessionAutoTransitionService started");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await CheckAndTransitionSessionsAsync(stoppingToken);
                    await CheckAndMarkDoneForTodayAsync(stoppingToken);
                    await CheckAndResetForDailyRecurrenceAsync(stoppingToken);
                }
                catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                {
                    _logger.LogError(ex, "Error in SessionAutoTransitionService");
                }
                catch (Exception)
                {
                    // Ignore errors during cancellation/shutdown
                }

                try
                {
                    await Task.Delay(_checkInterval, stoppingToken);
                }
                catch (TaskCanceledException)
                {
                    // Expected when service is stopping
                    break;
                }
            }

            _logger.LogInformation("SessionAutoTransitionService stopped");
        }

        /// <summary>
        /// Transition scheduled sessions to InProgress when start time arrives
        /// </summary>
        private async Task CheckAndTransitionSessionsAsync(CancellationToken cancellationToken)
        {
            using var scope = _serviceProvider.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<agapayDbContext>();
            var hubContext = scope.ServiceProvider.GetRequiredService<IHubContext<SessionsHub>>();

            var nowUtc = DateTime.UtcNow;
            // Grace period: transition sessions that started within the last 5 minutes
            var graceStart = nowUtc.AddMinutes(-5);

            // Find all scheduled sessions that should be auto-transitioned to InProgress
            var sessionsToTransition = await dbContext.TherapySessions
                .Where(s => s.Status == SessionStatus.Scheduled
                    && s.StartAt <= nowUtc
                    && s.StartAt >= graceStart)
                .ToListAsync(cancellationToken);

            if (sessionsToTransition.Any())
            {
                _logger.LogInformation($"Auto-transitioning {sessionsToTransition.Count} session(s) to InProgress");

                foreach (var session in sessionsToTransition)
                {
                    session.Status = SessionStatus.InProgress;

                    // Calculate startAtMs for timer synchronization using scheduled start time
                    var startAtMs = new DateTimeOffset(session.StartAt, TimeSpan.Zero).ToUnixTimeMilliseconds();

                    _logger.LogInformation($"Session {session.Id} auto-transitioned to InProgress (scheduled at {session.StartAt:yyyy-MM-dd HH:mm:ss} UTC, startAtMs: {startAtMs})");

                    // Broadcast SessionStarted event with startAtMs for timer sync
                    try
                    {
                        await hubContext.Clients.All.SendAsync("SessionStarted", new { sessionId = session.Id, startAtMs, autoStart = true }, cancellationToken);
                        _logger.LogInformation($"Broadcasted auto-transition SessionStarted event for session {session.Id} with startAtMs {startAtMs}");
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, $"Failed to broadcast auto-transition SessionStarted event for session {session.Id}");
                    }
                }

                await dbContext.SaveChangesAsync(cancellationToken);
            }
        }

        /// <summary>
        /// Mark sessions as DoneForToday when their end time has passed
        /// </summary>
        private async Task CheckAndMarkDoneForTodayAsync(CancellationToken cancellationToken)
        {
            using var scope = _serviceProvider.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<agapayDbContext>();
            var hubContext = scope.ServiceProvider.GetRequiredService<IHubContext<SessionsHub>>();

            var nowUtc = DateTime.UtcNow;

            // Find sessions that are InProgress or Scheduled and their end time has passed
            var sessionsToMarkDone = await dbContext.TherapySessions
                .Where(s => (s.Status == SessionStatus.InProgress || s.Status == SessionStatus.Scheduled)
                    && s.EndAt <= nowUtc)
                .ToListAsync(cancellationToken);

            if (sessionsToMarkDone.Any())
            {
                _logger.LogInformation($"Auto-marking {sessionsToMarkDone.Count} session(s) as DoneForToday");

                foreach (var session in sessionsToMarkDone)
                {
                    session.Status = SessionStatus.DoneForToday;

                    _logger.LogInformation($"Session {session.Id} auto-marked as DoneForToday (ended at {session.EndAt:yyyy-MM-dd HH:mm:ss} UTC)");

                    // Broadcast SessionMarkedDone event
                    try
                    {
                        await hubContext.Clients.All.SendAsync("SessionMarkedDone", new { sessionId = session.Id, autoComplete = true }, cancellationToken);
                        _logger.LogInformation($"Broadcasted SessionMarkedDone event for session {session.Id}");
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, $"Failed to broadcast SessionMarkedDone event for session {session.Id}");
                    }
                }

                await dbContext.SaveChangesAsync(cancellationToken);
            }
        }

        /// <summary>
        /// Reset DoneForToday sessions to Scheduled at 5 AM for daily recurrence.
        /// Updates StartAt and EndAt to today's date while keeping the same time.
        /// Skips sessions that are rescheduled to a future date.
        /// </summary>
        private async Task CheckAndResetForDailyRecurrenceAsync(CancellationToken cancellationToken)
        {
            using var scope = _serviceProvider.CreateScope();
            var sessionService = scope.ServiceProvider.GetRequiredService<ISessionService>();
            var hubContext = scope.ServiceProvider.GetRequiredService<IHubContext<SessionsHub>>();

            var nowUtc = DateTime.UtcNow;

            // Get the current time in Philippine timezone (UTC+8) to check if it's 5 AM local
            var philippineTimeZone = agapay_backend.Common.ManilaClock.Zone;
            var localNow = TimeZoneInfo.ConvertTimeFromUtc(nowUtc, philippineTimeZone);

            // Only run the reset logic between 5:00 AM and 5:01 AM local time
            if (localNow.Hour != 5 || localNow.Minute > 1)
            {
                return;
            }

            // Shared transition (shifts StartAt/EndAt to today's Manila date, preserving time-of-day)
            var resetCount = await sessionService.ResetDoneForTodaySessionsAsync(shiftDatesToToday: true, cancellationToken);

            if (resetCount > 0)
            {
                _logger.LogInformation($"Reset {resetCount} session(s) for daily recurrence at 5 AM");

                // Broadcast a general refresh event so clients can update their lists
                try
                {
                    await hubContext.Clients.All.SendAsync("SessionsRefresh", new { reason = "daily_reset", count = resetCount }, cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to broadcast SessionsRefresh event");
                }
            }
        }
    }
}

