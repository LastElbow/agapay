using System;
using System.Threading.Tasks;
using agapay_backend.Common;
using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Hubs;
using agapay_backend.Models.Requests;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace agapay_backend.Services.Admin
{
    /// <summary>
    /// User account moderation logic extracted verbatim from AdminController.
    /// Responses are returned as AdminActionResult records; the controller maps
    /// them back to the original IActionResult types.
    /// </summary>
    public class AccountModerationService : IAccountModerationService
    {
        private readonly agapayDbContext _context;
        private readonly UserManager<User> _userManager;
        private readonly IHubContext<NotificationsHub> _notificationsHub;
        private readonly ILogger<AccountModerationService> _logger;

        public AccountModerationService(
            agapayDbContext context,
            UserManager<User> userManager,
            IHubContext<NotificationsHub> notificationsHub,
            ILogger<AccountModerationService> logger)
        {
            _context = context;
            _userManager = userManager;
            _notificationsHub = notificationsHub;
            _logger = logger;
        }

        // GET api/Admin/users/{userId} - Get user details
        // (body moved from AdminController.GetUserDetails)
        public async Task<AdminActionResult> GetUserDetailsAsync(Guid userId)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null) return new AdminActionResult(404, "User not found");

            var roles = await _userManager.GetRolesAsync(user);

            return new AdminActionResult(200, new
            {
                user.Id,
                Name = NameUtils.FullName(user.FirstName, user.LastName),
                user.Email,
                Roles = roles,
                user.AccountStatus,
                user.SuspensionReason,
                user.SuspendedAt,
                user.SuspendedUntil,
                user.WarningCount,
                user.CreatedAt,
                user.LockoutEnd,
                user.LockoutEnabled
            });
        }

        // POST api/Admin/users/{userId}/warn - Issue a warning
        // (body moved from AdminController.WarnUser)
        public async Task<AdminActionResult> WarnUserAsync(Guid userId, WarnUserRequest request)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null) return new AdminActionResult(404, "User not found");

            user.WarningCount += 1;
            user.UpdatedAt = DateTime.UtcNow;

            // Check if user has reached 3 warnings - auto-suspend
            bool autoSuspended = false;
            if (user.WarningCount >= 3)
            {
                user.AccountStatus = "Suspended";
                user.SuspensionReason = $"Automatic suspension: Reached {user.WarningCount} warnings. Last warning reason: {request.Reason}";
                user.SuspendedAt = DateTime.UtcNow;
                user.SuspendedUntil = DateTime.UtcNow.AddDays(7); // 7 day suspension for 3 warnings
                user.LockoutEnabled = true;
                user.LockoutEnd = new DateTimeOffset(user.SuspendedUntil.Value);
                autoSuspended = true;
            }

            // Create warning notification for the user
            var warningNotification = new Notification
            {
                UserId = userId,
                Type = "warning",
                Title = "Account Warning",
                Message = $"You have received a warning from the administrator. Reason: {request.Reason}. This is warning #{user.WarningCount}.",
                CreatedAt = DateTime.UtcNow
            };
            _context.Notifications.Add(warningNotification);

            // If auto-suspended, also create a suspension notification
            if (autoSuspended)
            {
                var suspensionNotification = new Notification
                {
                    UserId = userId,
                    Type = "suspension",
                    Title = "Account Suspended",
                    Message = $"Your account has been automatically suspended for 7 days due to reaching {user.WarningCount} warnings. Please review our community guidelines.",
                    CreatedAt = DateTime.UtcNow.AddMilliseconds(100) // Slightly after warning so it shows second
                };
                _context.Notifications.Add(suspensionNotification);
            }

            _context.Users.Update(user);
            await _context.SaveChangesAsync();

            // Send real-time warning notification via SignalR
            await _notificationsHub.Clients.User(userId.ToString()).SendAsync("NewNotification", new
            {
                warningNotification.Id,
                warningNotification.Type,
                warningNotification.Title,
                warningNotification.Message,
                warningNotification.CreatedAt
            });

            // If auto-suspended, also send suspension notification
            if (autoSuspended)
            {
                await Task.Delay(500); // Small delay so notifications appear in order
                await _notificationsHub.Clients.User(userId.ToString()).SendAsync("NewNotification", new
                {
                    Id = Guid.NewGuid(),
                    Type = "suspension",
                    Title = "Account Suspended",
                    Message = $"Your account has been automatically suspended for 7 days due to reaching {user.WarningCount} warnings. Please review our community guidelines.",
                    CreatedAt = DateTime.UtcNow
                });
            }

            _logger.LogInformation("Warning issued to user {UserId}. Total warnings: {WarningCount}. Reason: {Reason}. AutoSuspended: {AutoSuspended}",
                userId, user.WarningCount, request.Reason, autoSuspended);

            return new AdminActionResult(200, new
            {
                message = autoSuspended
                    ? $"Warning issued and user automatically suspended (reached {user.WarningCount} warnings)"
                    : "Warning issued successfully",
                warningCount = user.WarningCount,
                reason = request.Reason,
                autoSuspended,
                accountStatus = user.AccountStatus
            });
        }

        // POST api/Admin/users/{userId}/suspend - Suspend user account
        // (body moved from AdminController.SuspendUser)
        public async Task<AdminActionResult> SuspendUserAsync(Guid userId, SuspendUserRequest request)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null) return new AdminActionResult(404, "User not found");

            user.AccountStatus = "Suspended";
            user.SuspensionReason = request.Reason;
            user.SuspendedAt = DateTime.UtcNow;
            user.SuspendedUntil = request.Duration switch
            {
                "1day" => DateTime.UtcNow.AddDays(1),
                "3days" => DateTime.UtcNow.AddDays(3),
                "7days" => DateTime.UtcNow.AddDays(7),
                "30days" => DateTime.UtcNow.AddDays(30),
                "permanent" => null, // null means permanent
                _ => DateTime.UtcNow.AddDays(7) // default 7 days
            };
            user.UpdatedAt = DateTime.UtcNow;

            // Also use Identity's lockout feature
            user.LockoutEnabled = true;
            user.LockoutEnd = user.SuspendedUntil.HasValue
                ? new DateTimeOffset(user.SuspendedUntil.Value)
                : DateTimeOffset.MaxValue;

            // Create notification for the user
            var durationText = request.Duration switch
            {
                "1day" => "1 day",
                "3days" => "3 days",
                "7days" => "7 days",
                "30days" => "30 days",
                "permanent" => "permanently",
                _ => "7 days"
            };
            var notification = new Notification
            {
                UserId = userId,
                Type = "suspension",
                Title = "Account Suspended",
                Message = $"Your account has been suspended for {durationText}. Reason: {request.Reason}",
                CreatedAt = DateTime.UtcNow
            };

            _context.Notifications.Add(notification);
            _context.Users.Update(user);
            await _context.SaveChangesAsync();

            // Send real-time notification via SignalR
            await _notificationsHub.Clients.User(userId.ToString()).SendAsync("NewNotification", new
            {
                notification.Id,
                notification.Type,
                notification.Title,
                notification.Message,
                notification.CreatedAt
            });

            // Force logout the user immediately if they're online
            await _notificationsHub.Clients.User(userId.ToString()).SendAsync("ForceLogout", new
            {
                Reason = "suspended",
                Message = $"Your account has been suspended. Reason: {request.Reason}"
            });

            _logger.LogInformation("User {UserId} suspended. Duration: {Duration}. Reason: {Reason}",
                userId, request.Duration, request.Reason);

            return new AdminActionResult(200, new
            {
                message = "User suspended successfully",
                accountStatus = user.AccountStatus,
                suspendedUntil = user.SuspendedUntil
            });
        }

        // POST api/Admin/users/{userId}/ban - Permanently ban user
        // (body moved from AdminController.BanUser)
        public async Task<AdminActionResult> BanUserAsync(Guid userId, BanUserRequest request)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null) return new AdminActionResult(404, "User not found");

            user.AccountStatus = "Banned";
            user.SuspensionReason = request.Reason;
            user.SuspendedAt = DateTime.UtcNow;
            user.SuspendedUntil = null; // permanent
            user.UpdatedAt = DateTime.UtcNow;

            // Lock out permanently
            user.LockoutEnabled = true;
            user.LockoutEnd = DateTimeOffset.MaxValue;

            // Create notification for the user
            var notification = new Notification
            {
                UserId = userId,
                Type = "ban",
                Title = "Account Banned",
                Message = $"Your account has been permanently banned. Reason: {request.Reason}",
                CreatedAt = DateTime.UtcNow
            };

            _context.Notifications.Add(notification);
            _context.Users.Update(user);
            await _context.SaveChangesAsync();

            // Send real-time notification via SignalR
            await _notificationsHub.Clients.User(userId.ToString()).SendAsync("NewNotification", new
            {
                notification.Id,
                notification.Type,
                notification.Title,
                notification.Message,
                notification.CreatedAt
            });

            // Force logout the user immediately if they're online
            await _notificationsHub.Clients.User(userId.ToString()).SendAsync("ForceLogout", new
            {
                Reason = "banned",
                Message = $"Your account has been permanently banned. Reason: {request.Reason}"
            });

            _logger.LogInformation("User {UserId} banned permanently. Reason: {Reason}", userId, request.Reason);

            return new AdminActionResult(200, new
            {
                message = "User banned permanently",
                accountStatus = user.AccountStatus
            });
        }

        // POST api/Admin/users/{userId}/restore - Restore user account
        // (body moved from AdminController.RestoreUser)
        public async Task<AdminActionResult> RestoreUserAsync(Guid userId)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null) return new AdminActionResult(404, "User not found");

            user.AccountStatus = "Active";
            user.SuspensionReason = null;
            user.SuspendedAt = null;
            user.SuspendedUntil = null;
            user.UpdatedAt = DateTime.UtcNow;

            // Remove lockout
            user.LockoutEnabled = false;
            user.LockoutEnd = null;

            _context.Users.Update(user);
            await _context.SaveChangesAsync();

            _logger.LogInformation("User {UserId} account restored", userId);

            return new AdminActionResult(200, new
            {
                message = "User account restored successfully",
                accountStatus = user.AccountStatus
            });
        }

        // PUT api/Admin/users/{userId}/modify-suspension - Modify suspension end date
        // (body moved from AdminController.ModifySuspension)
        public async Task<AdminActionResult> ModifySuspensionAsync(Guid userId, ModifySuspensionRequest request)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null) return new AdminActionResult(404, "User not found");

            if (user.AccountStatus != "Suspended")
            {
                return new AdminActionResult(400, "User is not currently suspended");
            }

            DateTime? newEndDate = request.NewDuration switch
            {
                "1day" => DateTime.UtcNow.AddDays(1),
                "3days" => DateTime.UtcNow.AddDays(3),
                "7days" => DateTime.UtcNow.AddDays(7),
                "30days" => DateTime.UtcNow.AddDays(30),
                "lift" => null, // Lift immediately
                _ => DateTime.UtcNow.AddDays(7)
            };

            if (request.NewDuration == "lift")
            {
                // Lift suspension entirely
                user.AccountStatus = "Active";
                user.SuspensionReason = null;
                user.SuspendedAt = null;
                user.SuspendedUntil = null;
                user.LockoutEnabled = false;
                user.LockoutEnd = null;

                // Notify user
                var notification = new Notification
                {
                    UserId = userId,
                    Type = "account",
                    Title = "Suspension Lifted",
                    Message = "Your account suspension has been lifted early by an administrator. You can now access your account normally.",
                    CreatedAt = DateTime.UtcNow
                };
                _context.Notifications.Add(notification);
            }
            else
            {
                // Modify suspension end date
                user.SuspendedUntil = newEndDate;
                user.LockoutEnd = newEndDate.HasValue ? new DateTimeOffset(newEndDate.Value) : null;
                user.UpdatedAt = DateTime.UtcNow;

                // Notify user of modified suspension
                var durationText = request.NewDuration switch
                {
                    "1day" => "1 day",
                    "3days" => "3 days",
                    "7days" => "7 days",
                    "30days" => "30 days",
                    _ => "7 days"
                };
                var notification = new Notification
                {
                    UserId = userId,
                    Type = "suspension",
                    Title = "Suspension Modified",
                    Message = $"Your account suspension has been modified. New duration: {durationText} from now.",
                    CreatedAt = DateTime.UtcNow
                };
                _context.Notifications.Add(notification);
            }

            _context.Users.Update(user);
            await _context.SaveChangesAsync();

            // Send real-time notification
            await _notificationsHub.Clients.User(userId.ToString()).SendAsync("NewNotification", new
            {
                Id = Guid.NewGuid(),
                Type = request.NewDuration == "lift" ? "account" : "suspension",
                Title = request.NewDuration == "lift" ? "Suspension Lifted" : "Suspension Modified",
                Message = request.NewDuration == "lift"
                    ? "Your account suspension has been lifted early."
                    : $"Your suspension has been modified.",
                CreatedAt = DateTime.UtcNow
            });

            _logger.LogInformation("User {UserId} suspension modified. New duration: {Duration}", userId, request.NewDuration);

            return new AdminActionResult(200, new
            {
                message = request.NewDuration == "lift" ? "Suspension lifted" : "Suspension modified",
                accountStatus = user.AccountStatus,
                suspendedUntil = user.SuspendedUntil
            });
        }
    }
}
