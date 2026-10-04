namespace agapay_backend.Models
{
    public class UpdateContractBlueprintDto
    {
        public string? CaseToTreat { get; set; }
        // Comma-separated list (e.g., "Saturday, Monday")
        public string? SessionDays { get; set; }
        public TimeOnly? SessionStartTime { get; set; }
        public TimeOnly? SessionEndTime { get; set; }
        // Specific date for the proposed session (e.g., "2024-12-11")
        public DateTime? ProposedSessionDate { get; set; }

        public decimal? ProfessionalFee { get; set; }
        public decimal? LocationFee { get; set; }
        public decimal? MiscellaneousFee { get; set; }
        public decimal? TotalFee { get; set; }
    }
}

