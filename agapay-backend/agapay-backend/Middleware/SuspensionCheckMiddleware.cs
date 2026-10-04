using System.Security.Claims;
using System.Text.Json;
using agapay_backend.Entities;
using Microsoft.AspNetCore.Identity;

namespace agapay_backend.Middleware
{
    /// <summary>
    /// Middleware that checks if a user is suspended and blocks restricted actions.
    /// Suspended users can only:
    /// - View their suspension status
    /// - Read notifications
    /// - Logout
    /// - View community guidelines
    /// </summary>
    public class SuspensionCheckMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<SuspensionCheckMiddleware> _logger;

        // Paths that suspended users ARE allowed to access
        private static readonly HashSet<string> AllowedPaths = new(StringComparer.OrdinalIgnoreCase)
        {
            "/api/auth/logout",
            "/api/auth/refresh",
            "/api/auth/me",
            "/api/users/suspension-status",
            "/api/notifications",
            "/hubs/notifications",
        };

        // Path prefixes that suspended users ARE allowed to access
        private static readonly string[] AllowedPathPrefixes = new[]
        {
            "/api/notifications",
            "/hubs/notifications",
            "/scalar",
            "/openapi",
        };

        // HTTP methods that don't need suspension check (reading data)
        // We still check GET for most endpoints, but allow some safe reads
        private static readonly HashSet<string> SafeReadPaths = new(StringComparer.OrdinalIgnoreCase)
        {
            "/api/auth/me",
            "/api/profile",
        };

        public SuspensionCheckMiddleware(RequestDelegate next, ILogger<SuspensionCheckMiddleware> logger)
        {
            _next = next;
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context, UserManager<User> userManager)
        {
            var path = context.Request.Path.Value ?? "";
            var method = context.Request.Method;

            // Skip check for unauthenticated requests
            if (!context.User.Identity?.IsAuthenticated ?? true)
            {
                await _next(context);
                return;
            }

            // Skip check for allowed paths
            if (IsAllowedPath(path))
            {
                await _next(context);
                return;
            }

            // Get user ID from claims
            var userIdClaim = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            {
                await _next(context);
                return;
            }

            // Get user from database
            var user = await userManager.FindByIdAsync(userId.ToString());
            if (user == null)
            {
                await _next(context);
                return;
            }

            // Check if user is suspended
            if (user.AccountStatus == "Suspended")
            {
                // Check if suspension has expired
                if (user.SuspendedUntil.HasValue && user.SuspendedUntil.Value <= DateTime.UtcNow)
                {
                    // Suspension expired - auto-lift it
                    user.AccountStatus = "Active";
                    user.SuspendedUntil = null;
                    user.SuspensionReason = null;
                    user.SuspendedAt = null;
                    user.LockoutEnd = null;
                    await userManager.UpdateAsync(user);

                    _logger.LogInformation("Auto-lifted expired suspension for user {UserId}", userId);

                    await _next(context);
                    return;
                }

                // User is still suspended - block the request
                _logger.LogWarning("Suspended user {UserId} attempted to access {Path}", userId, path);

                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                context.Response.ContentType = "application/json";

                var response = new
                {
                    error = "AccountSuspended",
                    message = "Your account is currently suspended.",
                    suspensionDetails = new
                    {
                        reason = user.SuspensionReason ?? "Violation of community guidelines",
                        suspendedAt = user.SuspendedAt,
                        suspendedUntil = user.SuspendedUntil,
                        isPermanent = !user.SuspendedUntil.HasValue
                    }
                };

                await context.Response.WriteAsync(JsonSerializer.Serialize(response, new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                }));
                return;
            }

            // Check if user is banned
            if (user.AccountStatus == "Banned")
            {
                _logger.LogWarning("Banned user {UserId} attempted to access {Path}", userId, path);

                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                context.Response.ContentType = "application/json";

                var response = new
                {
                    error = "AccountBanned",
                    message = "Your account has been permanently banned.",
                    suspensionDetails = new
                    {
                        reason = user.SuspensionReason ?? "Severe violation of community guidelines",
                        suspendedAt = user.SuspendedAt,
                        suspendedUntil = (DateTime?)null,
                        isPermanent = true
                    }
                };

                await context.Response.WriteAsync(JsonSerializer.Serialize(response, new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                }));
                return;
            }

            await _next(context);
        }

        private bool IsAllowedPath(string path)
        {
            // Check exact matches
            if (AllowedPaths.Contains(path))
                return true;

            // Check prefix matches
            foreach (var prefix in AllowedPathPrefixes)
            {
                if (path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                    return true;
            }

            return false;
        }
    }

    // Extension method to register the middleware
    public static class SuspensionCheckMiddlewareExtensions
    {
        public static IApplicationBuilder UseSuspensionCheck(this IApplicationBuilder builder)
        {
            return builder.UseMiddleware<SuspensionCheckMiddleware>();
        }
    }
}
