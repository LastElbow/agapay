namespace agapay_backend.Models
{
    public class ContractDetailDto
    {
        public int Id { get; set; }
        public int PatientId { get; set; }
        public int PhysicalTherapistId { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime? EndDate { get; set; }
        public string Status { get; set; } = string.Empty;

        // Blueprint
        public string? CaseToTreat { get; set; }
        public string? SessionDays { get; set; }
        public TimeOnly? SessionStartTime { get; set; }
        public TimeOnly? SessionEndTime { get; set; }

        public decimal? ProfessionalFee { get; set; }
        public decimal? LocationFee { get; set; }
        public decimal? MiscellaneousFee { get; set; }
        public decimal? TotalFee { get; set; }

        public DateTime? BlueprintProposedAt { get; set; }
        public DateTime? BlueprintConfirmedAt { get; set; }
        public bool IsAwaitingPatientConfirmation => Status == "PendingConfirmation";
    }
}
