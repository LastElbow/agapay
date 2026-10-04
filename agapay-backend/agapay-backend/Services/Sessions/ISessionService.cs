using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using agapay_backend.Models.Requests;

namespace agapay_backend.Services.Sessions
{
    /// <summary>
    /// Outcome of a session service operation that used to return an IActionResult:
    /// the controller maps these back to the exact same result types/status codes.
    /// </summary>
    public record SessionActionResult(int StatusCode, object? Payload);

    /// <summary>
    /// Session business logic extracted from SessionsController (and the session
    /// lifecycle endpoints of ContractsController). Every method receives the
    /// caller's ClaimsPrincipal explicitly so role-branching stays verbatim;
    /// real-time fan-out goes through IRealtimeNotifier so a hub failure can never
    /// fail an already-committed DB write.
    /// </summary>
    public interface ISessionService
    {
        // SessionsController endpoints
        Task<SessionActionResult> CreateAsync(System.Security.Claims.ClaimsPrincipal user, CreateSessionRequest dto);
        Task<SessionActionResult> CancelAsync(System.Security.Claims.ClaimsPrincipal user, int sessionId, CancelSessionRequest body);
        Task<SessionActionResult> RequestCancellationAsync(System.Security.Claims.ClaimsPrincipal user, int sessionId, RequestCancellationRequest body);
        Task<SessionActionResult> AcknowledgeCancellationAsync(System.Security.Claims.ClaimsPrincipal user, int sessionId, AcknowledgeCancellationRequest body);
        Task<SessionActionResult> ApproveRescheduleAsync(System.Security.Claims.ClaimsPrincipal user, int sessionId);
        Task<SessionActionResult> DeclineRescheduleAsync(System.Security.Claims.ClaimsPrincipal user, int sessionId, DeclineRescheduleBindingModel? model);
        Task<SessionActionResult> GetRelieverProposalsAsync(System.Security.Claims.ClaimsPrincipal user);
        Task<SessionActionResult> AcceptRelieverProposalAsync(System.Security.Claims.ClaimsPrincipal user, int sessionId);
        Task<SessionActionResult> DeclineRelieverProposalAsync(System.Security.Claims.ClaimsPrincipal user, int sessionId);
        Task<SessionActionResult> MarkAsDoneAsync(int sessionId);
        Task<SessionActionResult> LogTodaySessionAsync(int sessionId, LogTodayBindingModel model);
        Task<SessionActionResult> RescheduleAsync(System.Security.Claims.ClaimsPrincipal user, int sessionId, RescheduleSessionRequest body);

        // ContractsController endpoints
        Task<SessionActionResult> StartSessionAsync(int sessionId);
        Task<SessionActionResult> CompleteSessionAsync(int sessionId);

        // Shared background-service transition
        Task<int> ResetDoneForTodaySessionsAsync(bool shiftDatesToToday, CancellationToken cancellationToken = default);
    }
}
