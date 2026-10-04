using agapay_backend.Entities;

namespace agapay_backend.Services
{
  public interface IAvailabilityService
  {
    Task<double> CalculateAvailabilityScore(int therapistId, int patientId);
    Task<List<TherapistAvailability>> GetTherapistAvailability(int therapistId);
    Task UpdateTherapistAvailability(int therapistId, List<TherapistAvailabilityDto> availabilities);
    Task<List<int>> GetAvailableTherapists(DayOfWeekEnum dayOfWeek, TimeOnly startTime, TimeOnly endTime);
  }

  public class TherapistAvailabilityDto
  {
    public DayOfWeekEnum DayOfWeek { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public bool IsAvailable { get; set; } = true;
    public DateTime? SpecificDate { get; set; }
    public string? Notes { get; set; }
  }
}
