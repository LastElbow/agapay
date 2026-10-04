using agapay_backend.Entities;

namespace agapay_backend.Models
{
  public class PatientPreferencesDto
  {
    // New availability blocks (replaces single start/end time)
    public List<PatientAvailabilityDto>? Availabilities { get; set; }

    // Legacy fields (kept for backward compatibility during transition)
    public List<DayOfWeekEnum>? PreferredDaysOfWeek { get; set; }
    public TimeOnly? PreferredStartTime { get; set; }
    public TimeOnly? PreferredEndTime { get; set; }

    // Other preference filters
    public decimal? SessionBudget { get; set; }
    public string? PreferredSpecialization { get; set; }
    public string? DesiredService { get; set; }
    public List<string>? DesiredServices { get; set; } // Support for multiple services
    public string? PreferredBarangay { get; set; }
    public string? PreferredTherapistGender { get; set; }
  }
}
