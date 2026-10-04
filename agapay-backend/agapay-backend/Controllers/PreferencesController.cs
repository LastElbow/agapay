using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace agapay_backend.Controllers
{
  [Route("api/[controller]")]
  [ApiController]
  [Authorize(Roles = "Patient")]
  public class PreferencesController : ControllerBase
  {
    private readonly agapayDbContext _db;

    public PreferencesController(agapayDbContext db)
    {
      _db = db;
    }

    [HttpGet("me")]
    public async Task<IActionResult> GetMyPreferences()
    {
      var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
      if (userId is null) return Unauthorized();

      var patient = await _db.Patients
        .Include(p => p.Preferences)
        .ThenInclude(pp => pp!.PreferredDays)
        .Include(p => p.Availabilities)
            .FirstOrDefaultAsync(p => p.UserId == Guid.Parse(userId));
      if (patient is null) return NotFound("Patient not found");

      var pref = patient.Preferences;
      if (pref is null)
      {
        return Ok(new
        {
          PreferredDayOfWeek = (DayOfWeekEnum?)null,
          PreferredDaysOfWeek = (List<DayOfWeekEnum>?)null,
          PreferredStartTime = (TimeOnly?)null,
          PreferredEndTime = (TimeOnly?)null,
          SessionBudget = (decimal?)null,
          PreferredSpecialization = (string?)null,
          DesiredService = (string?)null,
          PreferredBarangay = (string?)null,
          PreferredTherapistGender = (string?)null
        });
      }

      return Ok(new
      {
        // New availability blocks
        Availabilities = patient.Availabilities?.Select(a => new PatientAvailabilityDto
        {
          DayOfWeek = a.DayOfWeek,
          StartTime = a.StartTime,
          EndTime = a.EndTime
        }).ToList() ?? new List<PatientAvailabilityDto>(),

        // Legacy fields for backward compatibility
        PreferredDayOfWeek = (pref.PreferredDays != null && pref.PreferredDays.Any())
            ? (DayOfWeekEnum?)pref.PreferredDays.First().DayOfWeek
            : (DayOfWeekEnum?)null,
        PreferredDaysOfWeek = pref.PreferredDays?.Select(d => d.DayOfWeek).ToList(),
        pref.PreferredStartTime,
        pref.PreferredEndTime,
        pref.SessionBudget,
        pref.PreferredSpecialization,
        pref.DesiredService,
        DesiredServices = !string.IsNullOrWhiteSpace(pref.DesiredService)
          ? pref.DesiredService.Split(',').ToList()
          : new List<string>(),
        pref.PreferredBarangay,
        pref.PreferredTherapistGender
      });
    }

    [HttpPost("me")] // upsert
    public async Task<IActionResult> UpsertMyPreferences(PatientPreferencesDto dto)
    {
      var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
      if (userId is null) return Unauthorized();

      var patient = await _db.Patients
        .Include(p => p.Preferences)
        .ThenInclude(pp => pp!.PreferredDays)
        .Include(p => p.Availabilities)
            .FirstOrDefaultAsync(p => p.UserId == Guid.Parse(userId));
      if (patient is null) return NotFound("Patient not found");

      if (patient.Preferences is null)
      {
        patient.Preferences = new PatientPreferences
        {
          PatientId = patient.Id,
          Patient = patient
        };
        _db.PatientPreferences.Add(patient.Preferences);
      }

      // Back-compat: if array provided, use it; else map single day if present
      var incomingDays = (dto.PreferredDaysOfWeek != null && dto.PreferredDaysOfWeek.Count > 0)
          ? dto.PreferredDaysOfWeek
          : new List<DayOfWeekEnum>();

      patient.Preferences.PreferredStartTime = dto.PreferredStartTime;
      patient.Preferences.PreferredEndTime = dto.PreferredEndTime;
      patient.Preferences.SessionBudget = dto.SessionBudget;
      patient.Preferences.PreferredSpecialization = dto.PreferredSpecialization;
      // Support both single DesiredService and multiple DesiredServices
      if (dto.DesiredServices != null && dto.DesiredServices.Count > 0)
      {
        patient.Preferences.DesiredService = string.Join(",", dto.DesiredServices);
      }
      else
      {
        patient.Preferences.DesiredService = dto.DesiredService;
      }
      patient.Preferences.PreferredBarangay = dto.PreferredBarangay;
      patient.Preferences.PreferredTherapistGender = dto.PreferredTherapistGender;
      patient.Preferences.UpdatedAt = DateTime.UtcNow;

      // Update preferred days collection
      await _db.Entry(patient.Preferences)
          .Collection(p => p.PreferredDays)
          .LoadAsync();

      if (patient.Preferences.PreferredDays is null)
      {
        patient.Preferences.PreferredDays = new List<PatientPreferredDay>();
      }

      // Clear and reset for simplicity; dataset is tiny
      if (patient.Preferences.PreferredDays.Count > 0)
      {
        _db.PatientPreferredDays.RemoveRange(patient.Preferences.PreferredDays);
        patient.Preferences.PreferredDays.Clear();
      }

      foreach (var d in incomingDays.Distinct())
      {
        patient.Preferences.PreferredDays.Add(new PatientPreferredDay
        {
          PatientPreferences = patient.Preferences,
          DayOfWeek = d
        });
      }

      // Handle new availability blocks
      // Clear existing availability blocks
      if (patient.Availabilities.Any())
      {
        _db.PatientAvailabilities.RemoveRange(patient.Availabilities);
        patient.Availabilities.Clear();
      }

      // Add new availability blocks if provided
      if (dto.Availabilities != null && dto.Availabilities.Count > 0)
      {
        foreach (var availDto in dto.Availabilities)
        {
          // Validate time range
          if (availDto.EndTime <= availDto.StartTime)
          {
            return BadRequest("End time must be after start time for availability blocks");
          }

          patient.Availabilities.Add(new PatientAvailability
          {
            Patient = patient,
            PatientId = patient.Id,
            DayOfWeek = availDto.DayOfWeek,
            StartTime = availDto.StartTime,
            EndTime = availDto.EndTime
          });
        }
      }

      await _db.SaveChangesAsync();
      return Ok(new { message = "Preferences saved" });
    }

    [HttpDelete("me")] // reset / remove preferences
    public async Task<IActionResult> DeleteMyPreferences()
    {
      var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
      if (userId is null) return Unauthorized();

      var patient = await _db.Patients
          .Include(p => p.Preferences)
          .FirstOrDefaultAsync(p => p.UserId == Guid.Parse(userId));
      if (patient is null) return NotFound("Patient not found");

      if (patient.Preferences is null)
      {
        // Nothing to delete; respond success for idempotency
        return Ok(new { message = "No preferences to reset" });
      }

      _db.PatientPreferences.Remove(patient.Preferences);
      await _db.SaveChangesAsync();
      return Ok(new { message = "Preferences reset" });
    }
  }
}
