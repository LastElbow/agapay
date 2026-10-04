using agapay_backend.Entities;

namespace agapay_backend.Models
{
  public class PatientAvailabilityDto
  {
    public DayOfWeekEnum DayOfWeek { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
  }
}
