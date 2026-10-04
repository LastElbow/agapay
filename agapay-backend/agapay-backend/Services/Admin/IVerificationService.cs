using System.Threading.Tasks;
using agapay_backend.Models;

namespace agapay_backend.Services.Admin
{
    /// <summary>
    /// Outcome of an admin service operation that used to return an IActionResult:
    /// the controller maps these back to the exact same result types/status codes.
    /// RedirectUrl carries the target for endpoints that returned Redirect(url).
    /// </summary>
    public record AdminActionResult(int StatusCode, object? Payload, string? RedirectUrl = null);

    /// <summary>
    /// Therapist verification logic extracted from AdminController. Every method
    /// returns an AdminActionResult so the controller can map it back to the
    /// original IActionResult types with byte-identical status codes and payloads.
    /// </summary>
    public interface IVerificationService
    {
        // GET api/Admin/submissions
        Task<AdminActionResult> GetSubmissionsListAsync();

        // GET api/Admin/submissions/{therapistId}
        Task<AdminActionResult> GetSubmissionDetailsAsync(int therapistId);

        // GET api/Admin/submissions/{therapistId}/license
        Task<AdminActionResult> GetSubmissionLicenseImageAsync(int therapistId);

        // GET api/Admin/submissions/{therapistId}/license-url
        Task<AdminActionResult> GetSubmissionLicenseUrlAsync(int therapistId);

        // POST api/Admin/therapist-verifications/{therapistId}/verify
        Task<AdminActionResult> VerifyTherapistAsync(int therapistId, TherapistVerificationDto verificationDto);

        // DELETE api/Admin/therapist/{therapistId}/license
        Task<AdminActionResult> DeleteTherapistLicenseAsync(int therapistId);
    }
}
