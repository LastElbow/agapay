using System;
using System.Threading.Tasks;
using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace agapay_backend.Services.Admin
{
    /// <summary>
    /// Therapist verification logic extracted verbatim from AdminController.
    /// Responses are returned as AdminActionResult records; the controller maps
    /// them back to the original IActionResult types.
    /// </summary>
    public class VerificationService : IVerificationService
    {
        private readonly agapayDbContext _context;
        private readonly UserManager<User> _userManager;
        private readonly ISupabaseStorageService _storageService;
        private readonly ILogger<VerificationService> _logger;

        public VerificationService(
            agapayDbContext context,
            UserManager<User> userManager,
            ISupabaseStorageService storageService,
            ILogger<VerificationService> logger)
        {
            _context = context;
            _userManager = userManager;
            _storageService = storageService;
            _logger = logger;
        }

        // Admin list: returns submissions for verification (no image URL or preview)
        // GET api/Admin/submissions (body moved from AdminController.GetSubmissionsList)
        public async Task<AdminActionResult> GetSubmissionsListAsync()
        {
            // Return only the metadata for the admin list UI (no image)
            var submissions = await _context.PhysicalTherapists
                .Include(pt => pt.User)
                .OrderBy(pt => pt.SubmittedAt)
                .Select(pt => new
                {
                    pt.Id,
                    pt.UserId,
                    UserName = pt.User.FirstName + " " + pt.User.LastName,
                    pt.User.Email,
                    pt.LicenseNumber,
                    submittedAt = pt.SubmittedAt,
                    status = pt.VerificationStatus.ToString()
                })
                .ToListAsync();

            return new AdminActionResult(200, submissions);
        }

        // Admin detail: returns full submission details including preview URL for the image
        // GET api/Admin/submissions/{therapistId} (body moved from AdminController.GetSubmissionDetails)
        public async Task<AdminActionResult> GetSubmissionDetailsAsync(int therapistId)
        {
            var therapist = await _context.PhysicalTherapists
                .Include(pt => pt.User)
                .FirstOrDefaultAsync(pt => pt.Id == therapistId);

            if (therapist is null) return new AdminActionResult(404, "Submission not found");

            // Normalize empty/whitespace to null to avoid clients receiving "" for img src
            var licensePath = string.IsNullOrWhiteSpace(therapist.LicenseImageUrl)
                ? null
                : therapist.LicenseImageUrl!.Trim();

            string? previewUrl = null;
            if (!string.IsNullOrEmpty(licensePath))
            {
                try
                {
                    // Request a short-lived signed URL for admin preview (60s)
                    previewUrl = await _storageService.GetSignedUrlAsync(licensePath, 60);
                }
                catch
                {
                    previewUrl = null;
                }

                // Fallback to public URL composition if signing fails or returns null
                if (string.IsNullOrWhiteSpace(previewUrl))
                {
                    try { previewUrl = _storageService.GetPublicUrl(licensePath); }
                    catch { previewUrl = null; }
                }
            }

            return new AdminActionResult(200, new
            {
                therapist.Id,
                therapist.UserId,
                UserName = therapist.User.FirstName + " " + therapist.User.LastName,
                therapist.User.Email,
                therapist.LicenseNumber,
                licenseImagePath = licensePath,
                licensePreviewUrl = previewUrl,
                therapist.SubmittedAt,
                therapist.VerifiedAt,
                therapist.RejectionReason,
                status = therapist.VerificationStatus.ToString()
            });
        }

        private async Task<string?> ResolveLicenseUrlAsync(string? licensePath, int expiresInSeconds = 60)
        {
            if (string.IsNullOrWhiteSpace(licensePath)) return null;

            string? url = null;
            try
            {
                url = await _storageService.GetSignedUrlAsync(licensePath.Trim(), expiresInSeconds);
            }
            catch { /* ignore, fallback to public */ }

            if (string.IsNullOrWhiteSpace(url))
            {
                try { url = _storageService.GetPublicUrl(licensePath!); }
                catch { url = null; }
            }

            return string.IsNullOrWhiteSpace(url) ? null : url;
        }

        // Direct image endpoint for admin UI <img src>. Issues a 302 redirect to a short-lived signed URL
        // or a public URL fallback. This avoids passing empty strings to the client and simplifies CORS.
        // GET api/Admin/submissions/{therapistId}/license (body moved from AdminController.GetSubmissionLicenseImage)
        public async Task<AdminActionResult> GetSubmissionLicenseImageAsync(int therapistId)
        {
            var therapist = await _context.PhysicalTherapists
                .FirstOrDefaultAsync(pt => pt.Id == therapistId);

            if (therapist is null)
                return new AdminActionResult(404, "Submission not found");

            var url = await ResolveLicenseUrlAsync(therapist.LicenseImageUrl);
            if (string.IsNullOrWhiteSpace(url))
                return new AdminActionResult(404, "Unable to resolve image URL");

            return new AdminActionResult(302, null, url);
        }

        // Returns a JSON payload with a short-lived signed URL suitable for embedding as an <img src>.
        // Useful when the front-end wants to fetch the URL first (e.g., to show loaders or handle errors).
        // GET api/Admin/submissions/{therapistId}/license-url (body moved from AdminController.GetSubmissionLicenseUrl)
        public async Task<AdminActionResult> GetSubmissionLicenseUrlAsync(int therapistId)
        {
            var therapist = await _context.PhysicalTherapists
                .FirstOrDefaultAsync(pt => pt.Id == therapistId);

            if (therapist is null)
                return new AdminActionResult(404, "Submission not found");

            var url = await ResolveLicenseUrlAsync(therapist.LicenseImageUrl);
            if (string.IsNullOrWhiteSpace(url))
                return new AdminActionResult(404, "Unable to resolve image URL");

            return new AdminActionResult(200, new { url });
        }

        // POST api/Admin/therapist-verifications/{therapistId}/verify (body moved from AdminController.VerifyTherapist)
        public async Task<AdminActionResult> VerifyTherapistAsync(int therapistId, TherapistVerificationDto verificationDto)
        {
            var therapist = await _context.PhysicalTherapists
                .Include(pt => pt.User)
                .FirstOrDefaultAsync(pt => pt.Id == therapistId);

            if (therapist is null)
            {
                return new AdminActionResult(404, "Physical therapist not found.");
            }

            if (therapist.VerificationStatus is not VerificationStatus.Pending)
            {
                return new AdminActionResult(400, "This therapist is not pending verification");
            }

            // Validate rejection reason when rejecting (backend enforcement)
            if (!verificationDto.IsApproved && string.IsNullOrWhiteSpace(verificationDto.RejectionReason))
            {
                return new AdminActionResult(400, new { error = "RejectionReason is required when IsApproved is false." });
            }

            // Approve flow
            if (verificationDto.IsApproved)
            {
                therapist.VerificationStatus = VerificationStatus.Verified;
                therapist.VerifiedAt = DateTime.UtcNow;
                therapist.RejectionReason = null;

                var user = therapist.User;
                var currentRoles = await _user_manager_GetRolesSafe(user);
                if (!currentRoles.Contains("PhysicalTherapist"))
                {
                    await _userManager.AddToRoleAsync(user, "PhysicalTherapist");
                }

                if (currentRoles.Contains("User"))
                {
                    await _userManager.RemoveFromRoleAsync(user, "User");
                }

                // Attempt to delete the submitted image from Supabase (best-effort).
                bool imageDeleted = false;
                string? deleteError = null;
                if (!string.IsNullOrEmpty(therapist.LicenseImageUrl))
                {
                    try
                    {
                        // Always await and log error if deletion fails
                        await _storage_service_DeleteSafe(therapist.LicenseImageUrl);
                        therapist.LicenseImageUrl = null;
                        imageDeleted = true;
                    }
                    catch (Exception ex)
                    {
                        // Log error for admin review, but continue approval
                        _logger.LogError(ex, "Failed to delete license image from Supabase for therapistId {Id}", therapist.Id);
                        deleteError = ex.Message;
                    }
                }

                _context.PhysicalTherapists.Update(therapist);
                await _context.SaveChangesAsync();

                return new AdminActionResult(200, new
                {
                    message = "Therapist Verified successfully",
                    status = therapist.VerificationStatus.ToString(),
                    licenseImageDeleted = imageDeleted,
                    licenseDeleteError = deleteError
                });
            }

            // Reject flow: delete the submitted image (if any), store rejection reason, set status
            try
            {
                if (!string.IsNullOrEmpty(therapist.LicenseImageUrl))
                {
                    // Attempt to delete stored image from Supabase
                    await _storage_service_DeleteSafe(therapist.LicenseImageUrl);

                    // Clear DB reference after successful delete
                    therapist.LicenseImageUrl = null;
                }
            }
            catch (Exception ex)
            {
                // If delete fails, return 500 so admin can retry; do not mark as rejected until image is removed.
                return new AdminActionResult(StatusCodes.Status500InternalServerError, new { error = "Failed to delete license image from storage", detail = ex.Message });
            }

            therapist.VerificationStatus = VerificationStatus.Rejected;
            therapist.VerifiedAt = DateTime.UtcNow;
            therapist.RejectionReason = string.IsNullOrWhiteSpace(verificationDto.RejectionReason)
                ? "Rejected by admin"
                : verificationDto.RejectionReason;

            _context.PhysicalTherapists.Update(therapist);
            await _context.SaveChangesAsync();

            return new AdminActionResult(200, new
            {
                message = "Therapist verification rejected",
                status = therapist.VerificationStatus.ToString()
            });
        }

        // helper to avoid modifying original code style too much
        private async Task<IList<string>> _user_manager_GetRolesSafe(User user)
        {
            return user is null ? new List<string>() : await _userManager.GetRolesAsync(user);
        }

        // DELETE api/Admin/therapist/{therapistId}/license (body moved from AdminController.DeleteTherapistLicense)
        public async Task<AdminActionResult> DeleteTherapistLicenseAsync(int therapistId)
        {
            var therapist = await _context.PhysicalTherapists
                .Include(pt => pt.User)
                .FirstOrDefaultAsync(pt => pt.Id == therapistId);

            if (therapist is null) return new AdminActionResult(404, "Therapist not found");

            if (string.IsNullOrEmpty(therapist.LicenseImageUrl))
            {
                return new AdminActionResult(204, null);
            }

            try
            {
                await _storage_service_DeleteSafe(therapist.LicenseImageUrl);
            }
            catch (Exception ex)
            {
                return new AdminActionResult(StatusCodes.Status500InternalServerError, new { error = "Failed to delete license image from storage", detail = ex.Message });
            }

            therapist.LicenseImageUrl = null;
            _context.PhysicalTherapists.Update(therapist);
            await _context.SaveChangesAsync();

            return new AdminActionResult(200, new { message = "License image deleted and DB reference cleared" });
        }

        // wrappers to keep call sites clean (and avoid accidental rename issues)
        private async Task _storage_service_DeleteSafe(string path)
        {
            await _storageService.DeleteFileAsync(path);
        }
    }
}
