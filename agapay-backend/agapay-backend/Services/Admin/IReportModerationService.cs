using System;
using System.Threading.Tasks;
using agapay_backend.Models.Requests;

namespace agapay_backend.Services.Admin
{
    /// <summary>
    /// Report moderation logic extracted verbatim from AdminController (plus the
    /// ModerationController status-update variant). Every method returns an
    /// AdminActionResult so the controller can map it back to the original
    /// IActionResult types with byte-identical status codes and payloads.
    /// </summary>
    public interface IReportModerationService
    {
        // GET api/Admin/reports/stats
        Task<AdminActionResult> GetReportStatsAsync();

        // GET api/Admin/reports
        Task<AdminActionResult> GetReportsAsync(
            string? search = null,
            string? status = null,
            string? priority = null,
            string? category = null,
            DateTime? fromDate = null,
            DateTime? toDate = null,
            string? sortBy = "createdAt",
            string? sortOrder = "desc");

        // GET api/Admin/reports/{id}
        Task<AdminActionResult> GetReportAsync(int id);

        // GET api/Admin/reports/user/{userId}/history
        Task<AdminActionResult> GetUserReportHistoryAsync(Guid userId);

        // PUT api/Admin/reports/{id}/priority
        Task<AdminActionResult> UpdateReportPriorityAsync(int id, UpdateReportPriorityRequest request);

        // PUT api/Admin/reports/{id}/notes
        Task<AdminActionResult> UpdateReportNotesAsync(int id, UpdateReportNotesRequest request);

        // PUT api/Admin/reports/{id}/status (admin variant — passes the caller for ReviewedBy)
        Task<AdminActionResult> UpdateReportStatusAsync(int id, UpdateReportStatusRequest request, System.Security.Claims.ClaimsPrincipal user);

        // POST api/Moderation/reports/{reportId}/status (ModerationController variant — different
        // validation and response shape; kept as a separate thin method so both callers keep
        // their exact caller-visible behavior)
        Task<AdminActionResult> ModerationUpdateReportStatusAsync(int reportId, string? status, System.Security.Claims.ClaimsPrincipal user);
    }
}
