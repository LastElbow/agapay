using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using agapay_backend.Common;
using agapay_backend.Data;
using agapay_backend.Models.Requests;
using Microsoft.EntityFrameworkCore;

namespace agapay_backend.Services.Admin
{
    /// <summary>
    /// Report moderation logic extracted verbatim from AdminController, plus the
    /// ModerationController variant of the status update. Responses are returned as
    /// AdminActionResult records; controllers map them back to the original
    /// IActionResult types.
    /// </summary>
    public class ReportModerationService : IReportModerationService
    {
        private readonly agapayDbContext _context;

        public ReportModerationService(agapayDbContext context)
        {
            _context = context;
        }

        // GET api/Admin/reports/stats - Get report statistics
        // (body moved from AdminController.GetReportStats)
        public async Task<AdminActionResult> GetReportStatsAsync()
        {
            var now = DateTime.UtcNow;
            var startOfWeek = now.AddDays(-(int)now.DayOfWeek);
            var startOfMonth = new DateTime(now.Year, now.Month, 1);

            var allReports = await _context.Reports.ToListAsync();

            var stats = new
            {
                TotalReports = allReports.Count,
                NewReports = allReports.Count(r => r.Status == "New"),
                ReviewingReports = allReports.Count(r => r.Status == "Reviewing"),
                ResolvedReports = allReports.Count(r => r.Status == "Resolved"),
                DismissedReports = allReports.Count(r => r.Status == "Dismissed"),
                ReportsThisWeek = allReports.Count(r => r.CreatedAt >= startOfWeek),
                ReportsThisMonth = allReports.Count(r => r.CreatedAt >= startOfMonth),
                HighPriorityCount = allReports.Count(r => r.Priority == "High" || r.Priority == "Critical"),
                CriticalCount = allReports.Count(r => r.Priority == "Critical"),
                AverageResolutionTimeHours = allReports
                    .Where(r => r.Status == "Resolved" && r.ReviewedAt.HasValue)
                    .Select(r => (r.ReviewedAt!.Value - r.CreatedAt).TotalHours)
                    .DefaultIfEmpty(0)
                    .Average(),
                CategoryBreakdown = allReports
                    .GroupBy(r => string.IsNullOrEmpty(r.Category) ? "General" : r.Category)
                    .Select(g => new { Category = g.Key, Count = g.Count() })
                    .OrderByDescending(x => x.Count)
                    .ToList()
            };

            return new AdminActionResult(200, stats);
        }

        // GET api/Admin/reports - List all reports
        // (body moved from AdminController.GetReports)
        public async Task<AdminActionResult> GetReportsAsync(
            string? search = null,
            string? status = null,
            string? priority = null,
            string? category = null,
            DateTime? fromDate = null,
            DateTime? toDate = null,
            string? sortBy = "createdAt",
            string? sortOrder = "desc")
        {
            var query = _context.Reports.AsQueryable();

            // Apply filters
            if (!string.IsNullOrEmpty(status) && status != "all")
            {
                query = query.Where(r => r.Status == status);
            }

            if (!string.IsNullOrEmpty(priority) && priority != "all")
            {
                query = query.Where(r => r.Priority == priority);
            }

            if (!string.IsNullOrEmpty(category) && category != "all")
            {
                query = query.Where(r => r.Category == category);
            }

            if (fromDate.HasValue)
            {
                query = query.Where(r => r.CreatedAt >= fromDate.Value);
            }

            if (toDate.HasValue)
            {
                query = query.Where(r => r.CreatedAt <= toDate.Value.AddDays(1));
            }

            var reports = await query
                .Select(r => new
                {
                    r.Id,
                    r.ReporterUserId,
                    r.ReportedUserId,
                    r.Category,
                    r.Notes,
                    r.Status,
                    Priority = r.Priority ?? "Medium",
                    AdminNotes = r.AdminNotes ?? "",
                    ResolutionSummary = r.ResolutionSummary ?? "",
                    r.CreatedAt,
                    r.ReviewedBy,
                    r.ReviewedAt
                })
                .ToListAsync();

            // Fetch user details for reporter and reported users
            var userIds = reports
                .SelectMany(r => new[] { r.ReporterUserId, r.ReportedUserId })
                .Distinct()
                .ToList();

            var users = await _context.Users
                .Where(u => userIds.Contains(u.Id))
                .Select(u => new { u.Id, Name = u.FirstName + " " + u.LastName, u.Email })
                .ToDictionaryAsync(u => u.Id);

            var result = reports.Select(r => new
            {
                r.Id,
                r.ReporterUserId,
                ReporterName = users.ContainsKey(r.ReporterUserId) ? users[r.ReporterUserId].Name : "Unknown",
                ReporterEmail = users.ContainsKey(r.ReporterUserId) ? users[r.ReporterUserId].Email : null,
                r.ReportedUserId,
                ReportedName = users.ContainsKey(r.ReportedUserId) ? users[r.ReportedUserId].Name : "Unknown",
                ReportedEmail = users.ContainsKey(r.ReportedUserId) ? users[r.ReportedUserId].Email : null,
                r.Category,
                r.Notes,
                r.Status,
                r.Priority,
                r.AdminNotes,
                r.ResolutionSummary,
                r.CreatedAt,
                r.ReviewedBy,
                r.ReviewedAt
            }).ToList();

            // Apply search filter (after user names are resolved)
            if (!string.IsNullOrEmpty(search))
            {
                var searchLower = search.ToLower();
                result = result.Where(r =>
                    r.ReporterName.ToLower().Contains(searchLower) ||
                    r.ReportedName.ToLower().Contains(searchLower) ||
                    (r.ReporterEmail?.ToLower().Contains(searchLower) ?? false) ||
                    (r.ReportedEmail?.ToLower().Contains(searchLower) ?? false) ||
                    (r.Notes?.ToLower().Contains(searchLower) ?? false) ||
                    (r.Category?.ToLower().Contains(searchLower) ?? false)
                ).ToList();
            }

            // Apply sorting
            result = (sortBy?.ToLower(), sortOrder?.ToLower()) switch
            {
                ("createdat", "asc") => result.OrderBy(r => r.CreatedAt).ToList(),
                ("createdat", _) => result.OrderByDescending(r => r.CreatedAt).ToList(),
                ("status", "asc") => result.OrderBy(r => r.Status).ToList(),
                ("status", _) => result.OrderByDescending(r => r.Status).ToList(),
                ("priority", "asc") => result.OrderBy(r => GetPriorityOrder(r.Priority)).ToList(),
                ("priority", _) => result.OrderByDescending(r => GetPriorityOrder(r.Priority)).ToList(),
                ("category", "asc") => result.OrderBy(r => r.Category).ToList(),
                ("category", _) => result.OrderByDescending(r => r.Category).ToList(),
                _ => result.OrderByDescending(r => r.CreatedAt).ToList()
            };

            return new AdminActionResult(200, result);
        }

        private int GetPriorityOrder(string? priority)
        {
            return priority switch
            {
                "Critical" => 4,
                "High" => 3,
                "Medium" => 2,
                "Low" => 1,
                _ => 2
            };
        }

        // GET api/Admin/reports/{id} - Get report details
        // (body moved from AdminController.GetReport)
        public async Task<AdminActionResult> GetReportAsync(int id)
        {
            var report = await _context.Reports.FindAsync(id);
            if (report == null) return new AdminActionResult(404, "Report not found");

            var reporter = await _context.Users.FindAsync(report.ReporterUserId);
            var reported = await _context.Users.FindAsync(report.ReportedUserId);

            return new AdminActionResult(200, new
            {
                report.Id,
                report.ReporterUserId,
                ReporterName = reporter != null ? NameUtils.FullName(reporter.FirstName, reporter.LastName) : "Unknown",
                ReporterEmail = reporter?.Email,
                report.ReportedUserId,
                ReportedName = reported != null ? NameUtils.FullName(reported.FirstName, reported.LastName) : "Unknown",
                ReportedEmail = reported?.Email,
                report.Category,
                report.Notes,
                report.Status,
                report.Priority,
                report.AdminNotes,
                report.ResolutionSummary,
                report.CreatedAt,
                report.ReviewedBy,
                report.ReviewedAt
            });
        }

        // GET api/Admin/reports/user/{userId}/history - Get all reports against a user
        // (body moved from AdminController.GetUserReportHistory)
        public async Task<AdminActionResult> GetUserReportHistoryAsync(Guid userId)
        {
            var reports = await _context.Reports
                .Where(r => r.ReportedUserId == userId)
                .OrderByDescending(r => r.CreatedAt)
                .Select(r => new
                {
                    r.Id,
                    r.ReporterUserId,
                    r.Category,
                    r.Notes,
                    r.Status,
                    r.Priority,
                    r.CreatedAt,
                    r.ReviewedAt
                })
                .ToListAsync();

            var reporterIds = reports.Select(r => r.ReporterUserId).Distinct().ToList();
            var reporters = await _context.Users
                .Where(u => reporterIds.Contains(u.Id))
                .Select(u => new { u.Id, Name = u.FirstName + " " + u.LastName })
                .ToDictionaryAsync(u => u.Id);

            var result = reports.Select(r => new
            {
                r.Id,
                ReporterName = reporters.ContainsKey(r.ReporterUserId) ? reporters[r.ReporterUserId].Name : "Unknown",
                r.Category,
                r.Notes,
                r.Status,
                r.Priority,
                r.CreatedAt,
                r.ReviewedAt
            });

            return new AdminActionResult(200, result);
        }

        // PUT api/Admin/reports/{id}/priority - Update report priority
        // (body moved from AdminController.UpdateReportPriority)
        public async Task<AdminActionResult> UpdateReportPriorityAsync(int id, UpdateReportPriorityRequest request)
        {
            var report = await _context.Reports.FindAsync(id);
            if (report == null) return new AdminActionResult(404, "Report not found");

            var validPriorities = new[] { "Low", "Medium", "High", "Critical" };
            if (!validPriorities.Contains(request.Priority))
            {
                return new AdminActionResult(400, "Invalid priority. Valid values are: Low, Medium, High, Critical");
            }

            report.Priority = request.Priority;
            _context.Reports.Update(report);
            await _context.SaveChangesAsync();

            return new AdminActionResult(200, new { message = "Report priority updated", priority = report.Priority });
        }

        // PUT api/Admin/reports/{id}/notes - Add/update admin notes
        // (body moved from AdminController.UpdateReportNotes)
        public async Task<AdminActionResult> UpdateReportNotesAsync(int id, UpdateReportNotesRequest request)
        {
            var report = await _context.Reports.FindAsync(id);
            if (report == null) return new AdminActionResult(404, "Report not found");

            report.AdminNotes = request.AdminNotes;
            _context.Reports.Update(report);
            await _context.SaveChangesAsync();

            return new AdminActionResult(200, new { message = "Admin notes updated", adminNotes = report.AdminNotes });
        }

        // PUT api/Admin/reports/{id}/status - Update report status
        // (body moved from AdminController.UpdateReportStatus)
        public async Task<AdminActionResult> UpdateReportStatusAsync(int id, UpdateReportStatusRequest request, ClaimsPrincipal user)
        {
            var report = await _context.Reports.FindAsync(id);
            if (report == null) return new AdminActionResult(404, "Report not found");

            var adminId = user.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;

            report.Status = request.Status;
            report.ReviewedBy = !string.IsNullOrEmpty(adminId) ? Guid.Parse(adminId) : null;
            report.ReviewedAt = DateTime.UtcNow;

            // If resolving, store the resolution summary
            if (request.Status == "Resolved" && !string.IsNullOrEmpty(request.ResolutionSummary))
            {
                report.ResolutionSummary = request.ResolutionSummary;
            }

            _context.Reports.Update(report);
            await _context.SaveChangesAsync();

            return new AdminActionResult(200, new { message = "Report status updated", report.Status, report.ResolutionSummary });
        }

        // POST api/Moderation/reports/{reportId:int}/status
        // (body moved verbatim from ModerationController.UpdateReportStatus; differs from the
        // admin variant: null/blank status validation, empty 404, strict reviewer parsing,
        // status trimming, no ResolutionSummary handling, and a different response shape)
        public async Task<AdminActionResult> ModerationUpdateReportStatusAsync(int reportId, string? status, ClaimsPrincipal user)
        {
            if (status == null || string.IsNullOrWhiteSpace(status))
            {
                return new AdminActionResult(400, "Status is required.");
            }

            var report = await _context.Reports.FirstOrDefaultAsync(r => r.Id == reportId);
            if (report == null)
            {
                return new AdminActionResult(404, null);
            }

            var currentUserId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(currentUserId, out var reviewerGuid))
            {
                return new AdminActionResult(400, "Invalid reviewer.");
            }

            report.Status = status.Trim();
            report.ReviewedBy = reviewerGuid;
            report.ReviewedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            return new AdminActionResult(200, new
            {
                report.Id,
                report.Status,
                report.ReviewedBy,
                report.ReviewedAt
            });
        }
    }
}
