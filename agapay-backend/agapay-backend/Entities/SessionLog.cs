using System;
using System.ComponentModel.DataAnnotations.Schema;

namespace agapay_backend.Entities
{
    public class SessionLog
    {
        public int Id { get; set; }

        [ForeignKey("TherapySessionId")]
        public int TherapySessionId { get; set; }
        public TherapySession TherapySession { get; set; } = null!;

        public DateTime StartTime { get; set; }
        public DateTime EndTime { get; set; }
        public DateTime Date { get; set; }
    }
}
