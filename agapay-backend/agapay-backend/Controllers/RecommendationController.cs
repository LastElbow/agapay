using agapay_backend.Data;
using agapay_backend.Models;
using agapay_backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace agapay_backend.Controllers
{
  [Route("api/[controller]")]
  [ApiController]
  public class RecommendationController : ControllerBase
  {
    private readonly IRecommendationService _recService;

    public RecommendationController(IRecommendationService recService)
    {
      _recService = recService;
    }

    [HttpGet("me")]
    [Authorize(Roles = "Patient")]
    public async Task<IActionResult> GetMyRecommendations([FromQuery] int top = 5)
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();

      // Resolve patientId from user id (cheap DB lookup)
      // For small systems, you can include a PatientService; for brevity we'll query here.
      using var scope = HttpContext.RequestServices.CreateScope();
      var db = scope.ServiceProvider.GetRequiredService<agapayDbContext>();
      var patient = await db.Patients
          .Include(p => p.Preferences)
          .ThenInclude(pp => pp!.PreferredDays)
          .Include(p => p.Availabilities)
          .FirstOrDefaultAsync(p => p.UserId == Guid.Parse(userId));
      if (patient is null) return NotFound("Patient not found");

      if (patient.Preferences is null)
      {
        return Conflict(new { message = "Set your patient preferences first to view recommendations." });
      }

      PatientPreferencesDto? preferencesDto = patient.Preferences is null
          ? null
          : new PatientPreferencesDto
          {
            Availabilities = patient.Availabilities?.Select(a => new PatientAvailabilityDto
            {
              DayOfWeek = a.DayOfWeek,
              StartTime = a.StartTime,
              EndTime = a.EndTime
            }).ToList(),
            PreferredDaysOfWeek = patient.Preferences.PreferredDays?.Select(d => d.DayOfWeek).ToList(),
            PreferredStartTime = patient.Preferences.PreferredStartTime,
            PreferredEndTime = patient.Preferences.PreferredEndTime,
            SessionBudget = patient.Preferences.SessionBudget,
            PreferredSpecialization = patient.Preferences.PreferredSpecialization,
            DesiredService = patient.Preferences.DesiredService,
            PreferredBarangay = patient.Preferences.PreferredBarangay,
            PreferredTherapistGender = patient.Preferences.PreferredTherapistGender
          };

      if (!HasMeaningfulPreferences(preferencesDto))
      {
        return Conflict(new { message = "Complete your patient preferences before requesting recommendations." });
      }

      var recommendations = await _recService.GetRecommendationsAsync(patient.Id, top, preferencesDto);
      return Ok(recommendations);
    }

    private static bool HasMeaningfulPreferences(PatientPreferencesDto? preferences)
    {
      if (preferences is null) return false;

      var hasAvailabilities = preferences.Availabilities is { Count: > 0 };
      var hasSchedule = preferences.PreferredStartTime.HasValue && preferences.PreferredEndTime.HasValue;
      var hasDays = preferences.PreferredDaysOfWeek is { Count: > 0 };
      var hasBudget = preferences.SessionBudget.HasValue && preferences.SessionBudget.Value > 0m;
      var hasSpecialization = !string.IsNullOrWhiteSpace(preferences.PreferredSpecialization);
      var hasDesiredService = !string.IsNullOrWhiteSpace(preferences.DesiredService);
      var hasBarangay = !string.IsNullOrWhiteSpace(preferences.PreferredBarangay);
      var hasTherapistGender = !string.IsNullOrWhiteSpace(preferences.PreferredTherapistGender);

      return hasAvailabilities || hasSchedule || hasDays || hasBudget || hasSpecialization || hasDesiredService || hasBarangay || hasTherapistGender;
    }
  }
}
