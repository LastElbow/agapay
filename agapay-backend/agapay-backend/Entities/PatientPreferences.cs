using System.ComponentModel.DataAnnotations.Schema;

namespace agapay_backend.Entities
{
  public class PatientPreferences
  {
    public int Id { get; set; }

    [ForeignKey("PatientId")]
    public int PatientId { get; set; }
    public required Patient Patient { get; set; }

    // Preferred time slots (similar structure to therapist availability)
    public TimeOnly? PreferredStartTime { get; set; }
    public TimeOnly? PreferredEndTime { get; set; }

    // Multi-day support: optional collection of preferred days
    public ICollection<PatientPreferredDay> PreferredDays { get; set; } = new List<PatientPreferredDay>();

    // Preference filters for recommendation
    public decimal? SessionBudget { get; set; }
    public string? PreferredSpecialization { get; set; }
    public string? DesiredService { get; set; }
    public string? PreferredBarangay { get; set; }
    public string? PreferredTherapistGender { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
  }
}
