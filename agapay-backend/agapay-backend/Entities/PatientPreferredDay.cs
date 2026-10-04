using System.ComponentModel.DataAnnotations.Schema;

namespace agapay_backend.Entities
{
  public class PatientPreferredDay
  {
    public int Id { get; set; }

    [ForeignKey("PatientPreferencesId")]
    public int PatientPreferencesId { get; set; }
    public PatientPreferences? PatientPreferences { get; set; }

    public DayOfWeekEnum DayOfWeek { get; set; }
  }
}
