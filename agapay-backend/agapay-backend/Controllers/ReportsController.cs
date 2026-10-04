using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Models.Requests;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace agapay_backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class ReportsController : ControllerBase
    {
        private readonly agapayDbContext _context;
        private readonly ILogger<ReportsController> _logger;

        public ReportsController(agapayDbContext context, ILogger<ReportsController> logger)
        {
            _context = context;
            _logger = logger;
        }

        // POST: api/Reports - Submit a new report
        [HttpPost]
        public async Task<IActionResult> SubmitReport([FromBody] SubmitReportRequest request)
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized("User not authenticated");
            }

            if (string.IsNullOrWhiteSpace(request.Reason))
            {
                return BadRequest("Report reason is required");
            }

            var report = new Report
            {
                ReporterUserId = Guid.Parse(userId),
                ReportedUserId = request.ReportedUserId,
                Category = request.Category ?? "General",
                Notes = request.Reason,
                Status = "New",
                CreatedAt = DateTime.UtcNow
            };

            _context.Reports.Add(report);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Report submitted by {ReporterId} against {ReportedId}", userId, request.ReportedUserId);

        return Ok(new { message = "Report submitted successfully", reportId = report.Id });
    }
  }
}
