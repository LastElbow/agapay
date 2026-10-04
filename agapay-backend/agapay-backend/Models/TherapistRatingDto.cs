namespace agapay_backend.Models
{
    public class TherapistRatingDto
    {
        public int Id { get; set; }
        public int ContractId { get; set; }
        public int PatientId { get; set; }
        public string? PatientName { get; set; }
        public string? PatientProfilePictureUrl { get; set; }
        public byte Score { get; set; }
        public string? Comment { get; set; }
        public DateTime CreatedAt { get; set; }
        public string? CaseToTreat { get; set; }
    }
}
