namespace agapay_backend.Models
{
    public class CreateContractDto
    {
        public int PatientId { get; set; }
        public int PhysicalTherapistId { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime? EndDate { get; set; }
    }
}
