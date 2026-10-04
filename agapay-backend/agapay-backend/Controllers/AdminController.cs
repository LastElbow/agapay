using System.Threading.Tasks;
using agapay_backend.Models;
using agapay_backend.Models.Requests;
using agapay_backend.Services.Admin;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace agapay_backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "Admin")]
    public class AdminController : ControllerBase
    {
        private readonly IVerificationService _verificationService;
        private readonly IReportModerationService _reportModerationService;
        private readonly IAccountModerationService _accountModerationService;

        public AdminController(
            IVerificationService verificationService,
            IReportModerationService reportModerationService,
            IAccountModerationService accountModerationService)
        {
            _verificationService = verificationService;
            _reportModerationService = reportModerationService;
            _accountModerationService = accountModerationService;
        }

        // Maps an AdminActionResult back to the same IActionResult type the extracted
        // AdminController body returned (see Services/Auth/IAuthService.cs pattern).
        // RedirectUrl restores Redirect(url); 204 maps to NoContent().
        private IActionResult ToActionResult(AdminActionResult result)
        {
            if (result.RedirectUrl is not null)
            {
                return Redirect(result.RedirectUrl);
            }

            return result.StatusCode switch
            {
                200 => result.Payload is null ? Ok() : Ok(result.Payload),
                204 => NoContent(),
                400 => result.Payload is null ? BadRequest() : BadRequest(result.Payload),
                404 => result.Payload is null ? NotFound() : NotFound(result.Payload),
                _ => StatusCode(result.StatusCode, result.Payload)
            };
        }

        // Admin list: returns submissions for verification (no image URL or preview)
        [HttpGet("submissions")]
        public async Task<IActionResult> GetSubmissionsList()
            => ToActionResult(await _verificationService.GetSubmissionsListAsync());

        // Admin detail: returns full submission details including preview URL for the image
        [HttpGet("submissions/{therapistId}")]
        public async Task<IActionResult> GetSubmissionDetails(int therapistId)
            => ToActionResult(await _verificationService.GetSubmissionDetailsAsync(therapistId));

        // Direct image endpoint for admin UI <img src>. Issues a 302 redirect to a short-lived signed URL
        // or a public URL fallback. This avoids passing empty strings to the client and simplifies CORS.
        [HttpGet("submissions/{therapistId}/license")]
        public async Task<IActionResult> GetSubmissionLicenseImage(int therapistId)
            => ToActionResult(await _verificationService.GetSubmissionLicenseImageAsync(therapistId));

        // Returns a JSON payload with a short-lived signed URL suitable for embedding as an <img src>.
        // Useful when the front-end wants to fetch the URL first (e.g., to show loaders or handle errors).
        [HttpGet("submissions/{therapistId}/license-url")]
        public async Task<IActionResult> GetSubmissionLicenseUrl(int therapistId)
            => ToActionResult(await _verificationService.GetSubmissionLicenseUrlAsync(therapistId));

        [HttpPost("therapist-verifications/{therapistId}/verify")]
        public async Task<IActionResult> VerifyTherapist(int therapistId, TherapistVerificationDto verificationDto)
            => ToActionResult(await _verificationService.VerifyTherapistAsync(therapistId, verificationDto));

        [HttpDelete("therapist/{therapistId}/license")]
        public async Task<IActionResult> DeleteTherapistLicense(int therapistId)
            => ToActionResult(await _verificationService.DeleteTherapistLicenseAsync(therapistId));

        // ===================== REPORTS ENDPOINTS =====================

        // GET: api/Admin/reports/stats - Get report statistics
        [HttpGet("reports/stats")]
        public async Task<IActionResult> GetReportStats()
            => ToActionResult(await _reportModerationService.GetReportStatsAsync());

        // GET: api/Admin/reports - List all reports
        [HttpGet("reports")]
        public async Task<IActionResult> GetReports(
            [FromQuery] string? search = null,
            [FromQuery] string? status = null,
            [FromQuery] string? priority = null,
            [FromQuery] string? category = null,
            [FromQuery] DateTime? fromDate = null,
            [FromQuery] DateTime? toDate = null,
            [FromQuery] string? sortBy = "createdAt",
            [FromQuery] string? sortOrder = "desc")
            => ToActionResult(await _reportModerationService.GetReportsAsync(search, status, priority, category, fromDate, toDate, sortBy, sortOrder));

        // GET: api/Admin/reports/{id} - Get report details
        [HttpGet("reports/{id}")]
        public async Task<IActionResult> GetReport(int id)
            => ToActionResult(await _reportModerationService.GetReportAsync(id));

        // GET: api/Admin/reports/user/{userId}/history - Get all reports against a user
        [HttpGet("reports/user/{userId}/history")]
        public async Task<IActionResult> GetUserReportHistory(Guid userId)
            => ToActionResult(await _reportModerationService.GetUserReportHistoryAsync(userId));

        // PUT: api/Admin/reports/{id}/priority - Update report priority
        [HttpPut("reports/{id}/priority")]
        public async Task<IActionResult> UpdateReportPriority(int id, [FromBody] UpdateReportPriorityRequest request)
            => ToActionResult(await _reportModerationService.UpdateReportPriorityAsync(id, request));

        // PUT: api/Admin/reports/{id}/notes - Add/update admin notes
        [HttpPut("reports/{id}/notes")]
        public async Task<IActionResult> UpdateReportNotes(int id, [FromBody] UpdateReportNotesRequest request)
            => ToActionResult(await _reportModerationService.UpdateReportNotesAsync(id, request));

        // PUT: api/Admin/reports/{id}/status - Update report status
        [HttpPut("reports/{id}/status")]
        public async Task<IActionResult> UpdateReportStatus(int id, [FromBody] UpdateReportStatusRequest request)
            => ToActionResult(await _reportModerationService.UpdateReportStatusAsync(id, request, User));

        // ===================== USER ACCOUNT MANAGEMENT =====================

        // GET: api/Admin/users/{userId} - Get user details
        [HttpGet("users/{userId}")]
        public async Task<IActionResult> GetUserDetails(Guid userId)
            => ToActionResult(await _accountModerationService.GetUserDetailsAsync(userId));

        // POST: api/Admin/users/{userId}/warn - Issue a warning
        [HttpPost("users/{userId}/warn")]
        public async Task<IActionResult> WarnUser(Guid userId, [FromBody] WarnUserRequest request)
            => ToActionResult(await _accountModerationService.WarnUserAsync(userId, request));

        // POST: api/Admin/users/{userId}/suspend - Suspend user account
        [HttpPost("users/{userId}/suspend")]
        public async Task<IActionResult> SuspendUser(Guid userId, [FromBody] SuspendUserRequest request)
            => ToActionResult(await _accountModerationService.SuspendUserAsync(userId, request));

        // POST: api/Admin/users/{userId}/ban - Permanently ban user
        [HttpPost("users/{userId}/ban")]
        public async Task<IActionResult> BanUser(Guid userId, [FromBody] BanUserRequest request)
            => ToActionResult(await _accountModerationService.BanUserAsync(userId, request));

        // POST: api/Admin/users/{userId}/restore - Restore user account
        [HttpPost("users/{userId}/restore")]
        public async Task<IActionResult> RestoreUser(Guid userId)
            => ToActionResult(await _accountModerationService.RestoreUserAsync(userId));

        // PUT: api/Admin/users/{userId}/modify-suspension - Modify suspension end date
        [HttpPut("users/{userId}/modify-suspension")]
        public async Task<IActionResult> ModifySuspension(Guid userId, [FromBody] ModifySuspensionRequest request)
            => ToActionResult(await _accountModerationService.ModifySuspensionAsync(userId, request));
    }
}
