using System.ComponentModel.DataAnnotations.Schema;

namespace agapay_backend.Entities
{
  public class PatientAvailability
  {
    public int Id { get; set; }

    [ForeignKey("PatientId")]
    public int PatientId { get; set; }
    public required Patient Patient { get; set; }

    public DayOfWeekEnum DayOfWeek { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
  }
}
