namespace agapay_backend.Models
{
    public class SubmitRatingDto
    {
        public int TherapistId { get; set; }
        public int ContractId { get; set; } // prefer client to send session id to prove provenance
        public byte Score { get; set; } // 1..5
        public string? Comment { get; set; }
    }
}
