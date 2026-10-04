using System.ComponentModel.DataAnnotations.Schema;

namespace agapay_backend.Entities
{
    public enum DayOfWeekEnum
    {
        Sunday = 0,
        Monday = 1, 
        Tuesday = 2,
        Wednesday = 3, 
        Thursday = 4, 
        Friday = 5, 
        Saturday = 6
    }
    public class TherapistAvailability
    {
        public int Id { get; set; }

        [ForeignKey("PhysicalTherapistId")]
        public int PhysicalTherapistId { get; set; }
        public PhysicalTherapist? PhysicalTherapist { get; set; }

        public DayOfWeekEnum DayOfWeek { get; set; }
        public TimeOnly StartTime { get; set; }
        public TimeOnly EndTime { get; set; }
        public bool IsAvailable { get; set; } = true;

        // For future use - can mark specific dates as unavailable
        public DateTime? SpecificDate { get; set; }
        public string? Notes { get; set; }
    }
}
