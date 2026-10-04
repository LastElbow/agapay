using System.ComponentModel.DataAnnotations.Schema;

namespace agapay_backend.Entities
{
    public class TherapistRating
    {
        public int Id { get; set; }

        [ForeignKey("ContractId")]
        public int ContractId { get; set; }
        public Contract? Contract { get; set; }

        [ForeignKey("PhysicalTherapistId")]
        public int PhysicalTherapistId { get; set; }
        public PhysicalTherapist? PhysicalTherapist { get; set; }

        [ForeignKey("PatientId")]
        public int PatientId { get; set; }
        public Patient? Patient { get; set; }



        // 1..5
        public byte Score { get; set; }

        public string? Comment { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
