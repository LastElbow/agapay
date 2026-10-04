using System;
using System.Linq;
using System.Threading.Tasks;
using agapay_backend.Data;
using agapay_backend.Services.Admin;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace agapay_backend.Controllers
{
  [ApiController]
  [Route("api/[controller]")]
  [Authorize(Roles = "Admin")]
  public class ModerationController : ControllerBase
  {
    private readonly agapayDbContext _context;
    private readonly IReportModerationService _reportModerationService;

    public ModerationController(agapayDbContext context, IReportModerationService reportModerationService)
    {
      _context = context;
      _reportModerationService = reportModerationService;
    }

    [HttpGet("reports")]
    public async Task<IActionResult> GetReports([FromQuery] string? status = null)
    {
      var query = _context.Reports.AsNoTracking();

      if (!string.IsNullOrWhiteSpace(status))
      {
        query = query.Where(r => r.Status == status);
      }

      var reports = await query
          .OrderByDescending(r => r.CreatedAt)
          .Take(500)
          .Select(r => new
          {
            r.Id,
            r.ReporterUserId,
            r.ReportedUserId,
            r.ConversationId,
            r.MessageId,
            r.Category,
            r.Notes,
            r.Status,
            r.CreatedAt,
            r.ReviewedBy,
            r.ReviewedAt
          })
          .ToListAsync();

      return Ok(reports);
    }

    public class UpdateReportStatusRequest
    {
      public string Status { get; set; } = string.Empty;
    }

    [HttpPost("reports/{reportId:int}/status")]
    public async Task<IActionResult> UpdateReportStatus(int reportId, [FromBody] UpdateReportStatusRequest request)
      => ToActionResult(await _reportModerationService.ModerationUpdateReportStatusAsync(reportId, request?.Status, User));

    // Maps an AdminActionResult back to the same IActionResult type the extracted
    // ModerationController body returned (see Services/Auth/IAuthService.cs pattern).
    private IActionResult ToActionResult(AdminActionResult result)
    {
      return result.StatusCode switch
      {
        200 => result.Payload is null ? Ok() : Ok(result.Payload),
        400 => result.Payload is null ? BadRequest() : BadRequest(result.Payload),
        404 => result.Payload is null ? NotFound() : NotFound(result.Payload),
        _ => StatusCode(result.StatusCode, result.Payload)
      };
    }
  }
}
