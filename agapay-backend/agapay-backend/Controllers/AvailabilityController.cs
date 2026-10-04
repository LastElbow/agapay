using agapay_backend.Common;
using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace agapay_backend.Controllers
{
  [Route("api/[controller]")]
  [ApiController]
  [Authorize]
  public class AvailabilityController : ControllerBase
  {
    private readonly IAvailabilityService _availabilityService;
    private readonly agapayDbContext _db;

    public AvailabilityController(IAvailabilityService availabilityService, agapayDbContext db)
    {
      _availabilityService = availabilityService;
      _db = db;
    }

    [HttpGet("therapist/{therapistId}")]
    public async Task<IActionResult> GetTherapistAvailability(int therapistId)
    {
      var availability = await _availabilityService.GetTherapistAvailability(therapistId);
      return Ok(availability);
    }

    [HttpPost("therapist/{therapistId}")]
    [Authorize(Roles = "PhysicalTherapist")]
    public async Task<IActionResult> UpdateTherapistAvailability(int therapistId, List<TherapistAvailabilityDto> availabilities)
    {
      // Ensure the authenticated therapist matches the route therapistId
      var me = await User.GetForCallerAsync(_db);
      if (me is null) return Forbid();
      if (me.Id != therapistId) return Forbid();

      try
      {
        await _availabilityService.UpdateTherapistAvailability(therapistId, availabilities);
        return Ok(new { message = "Availability updated successfully" });
      }
      catch (ArgumentException ex)
      {
        return BadRequest(new { message = ex.Message });
      }
      catch (InvalidOperationException ex)
      {
        return BadRequest(new { message = ex.Message });
      }
      catch (Exception)
      {
        return StatusCode(500, new { message = "An unexpected error occurred while updating availability." });
      }
    }

    [HttpGet("score/{therapistId}/{patientId}")]
    public async Task<IActionResult> GetAvailabilityScore(int therapistId, int patientId)
    {
      var score = await _availabilityService.CalculateAvailabilityScore(therapistId, patientId);
      return Ok(new { score });
    }

    // Returns booked session intervals for a therapist within a range (sanitized: no details)
    [HttpGet("therapist/{therapistId}/booked")]
    public async Task<IActionResult> GetBookedIntervals(int therapistId, [FromQuery] DateTime from, [FromQuery] DateTime to)
    {
      if (to <= from)
      {
        return BadRequest(new { message = "Query param 'to' must be after 'from'" });
      }

      // Only include sessions that are active/blocking
      // Exclude: Completed, Cancelled, DoneForToday sessions AND sessions from ended contracts (Completed, Terminated)
      var sessions = await _db.TherapySessions
          .AsNoTracking()
          .Include(s => s.Contract)
          .Where(s => s.PhysicalTherapistId == therapistId
                   && s.Status != SessionStatus.Completed
                   && s.Status != SessionStatus.Cancelled
                   && s.Status != SessionStatus.DoneForToday
                   && s.StartAt < to && from < s.EndAt
                   && s.Contract!.Status != ContractStatus.Completed
                   && s.Contract!.Status != ContractStatus.Terminated)
          .Select(s => new Models.BookedSlotDto
          {
            StartAt = s.StartAt,
            EndAt = s.EndAt
          })
          .OrderBy(s => s.StartAt)
          .ToListAsync();

      return Ok(sessions);
    }
  }
}
