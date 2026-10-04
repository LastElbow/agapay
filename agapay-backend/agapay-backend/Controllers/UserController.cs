using agapay_backend.Data;
using agapay_backend.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace agapay_backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class UserController : ControllerBase
    {
        private readonly agapayDbContext _context;
        private readonly UserManager<User> _userManager;

        public UserController(agapayDbContext context, UserManager<User> userManager)
        {
            _context = context;
            _userManager = userManager;
        }

        [HttpGet]
        [Authorize(Roles = "Admin")]
        public async Task<ActionResult> GetUsers()
        {
            var users = await _context.Users
                .AsNoTracking()
                .Select(u => new
                {
                    u.Id,
                    u.Email,
                    u.UserName,
                    u.FirstName,
                    u.LastName,
                    u.PhoneNumber,
                    u.EmailConfirmed,
                    u.LockoutEnabled,
                    u.LockoutEnd,
                    u.TwoFactorEnabled,
                    u.CreatedAt,
                    u.UpdatedAt
                })
                .ToListAsync();

            return Ok(users);
        }

        /// <summary>
        /// Get the current user's suspension status. This endpoint is always accessible,
        /// even when the user is suspended, so they can see their suspension details.
        /// </summary>
        [HttpGet("suspension-status")]
        [Authorize]
        public async Task<ActionResult> GetSuspensionStatus()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            {
                return Unauthorized();
            }

            var user = await _userManager.FindByIdAsync(userId.ToString());
            if (user == null)
            {
                return NotFound(new { error = "User not found" });
            }

            // Check if suspension has expired and auto-lift it
            if (user.AccountStatus == "Suspended" &&
                user.SuspendedUntil.HasValue &&
                user.SuspendedUntil.Value <= DateTime.UtcNow)
            {
                user.AccountStatus = "Active";
                user.SuspendedUntil = null;
                user.SuspensionReason = null;
                user.SuspendedAt = null;
                user.LockoutEnd = null;
                await _userManager.UpdateAsync(user);
            }

            return Ok(new
            {
                accountStatus = user.AccountStatus,
                isSuspended = user.AccountStatus == "Suspended",
                isBanned = user.AccountStatus == "Banned",
                isActive = user.AccountStatus == "Active",
                suspensionDetails = user.AccountStatus != "Active" ? new
                {
                    reason = user.SuspensionReason,
                    suspendedAt = user.SuspendedAt,
                    suspendedUntil = user.SuspendedUntil,
                    isPermanent = user.AccountStatus == "Banned" || !user.SuspendedUntil.HasValue,
                    warningCount = user.WarningCount
                } : null
            });
        }

        [HttpDelete("me")]
        [Authorize]
        public async Task<ActionResult> DeleteCurrentUser()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            {
                return Unauthorized();
            }

            var user = await _context.Users
                .Include(u => u.Patients)
                .Include(u => u.PhysicalTherapist)
                .FirstOrDefaultAsync(u => u.Id == userId);

            if (user == null)
            {
                return NotFound(new { error = "User not found" });
            }

            // 1. Scrub User PII & Credentials
            string placeholder = $"deleted_{userId.ToString("N")}";
            user.FirstName = "Anonymized";
            user.LastName = "User";
            user.PhoneNumber = null;
            user.ProfilePictureUrl = null;
            user.DateOfBirth = default;
            user.Gender = null;
            user.AccountStatus = "Deleted";
            user.PreferredRole = null;

            // Invalidate passwords & token states
            user.PasswordHash = "";
            user.SecurityStamp = Guid.NewGuid().ToString();
            user.ConcurrencyStamp = Guid.NewGuid().ToString();
            user.RefreshToken = null;
            user.RefreshTokenExpiryTime = null;

            // Anonymize unique fields
            user.Email = $"{placeholder}@deleted.agapay.com";
            user.NormalizedEmail = user.Email.ToUpper();
            user.UserName = placeholder;
            user.NormalizedUserName = placeholder.ToUpper();
            user.EmailConfirmed = false;
            user.PhoneNumberConfirmed = false;
            user.TwoFactorEnabled = false;

            // 2. Scrub associated Patient profiles
            if (user.Patients != null)
            {
                foreach (var patient in user.Patients)
                {
                    patient.FirstName = "Anonymized";
                    patient.LastName = "Patient";
                    patient.DateOfBirth = default;
                    patient.Gender = null;
                    patient.Address = null;
                    patient.Barangay = null;
                    patient.Latitude = null;
                    patient.Longitude = null;
                    patient.Occupation = null;
                    patient.ActivityLevel = null;
                    patient.CurrentComplaints = null;
                    patient.IsActive = false;
                    patient.IsOnboardingComplete = false;

                    // Remove preferences if configured
                    if (patient.Preferences != null)
                    {
                        _context.Remove(patient.Preferences);
                    }
                }
            }

            // 3. Scrub associated PhysicalTherapist profile
            if (user.PhysicalTherapist != null)
            {
                var therapist = user.PhysicalTherapist;
                therapist.LicenseNumber = $"DELETED_{therapist.Id}";
                therapist.LicenseImageUrl = null;
                therapist.WorkPhoneNumber = null;
                therapist.ProfilePictureUrl = null;
                therapist.Gender = null;
                therapist.RejectionReason = null;
                therapist.OtherConditionsTreated = null;
                therapist.IsOnboardingComplete = false;
                therapist.VerificationStatus = VerificationStatus.Rejected; // Marks as inactive/de-verified

                // Clean up service areas
                if (therapist.ServiceAreas != null && therapist.ServiceAreas.Any())
                {
                    _context.RemoveRange(therapist.ServiceAreas);
                }
            }

            user.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            return Ok(new { message = "Account successfully deleted and anonymized." });
        }
    }
}
