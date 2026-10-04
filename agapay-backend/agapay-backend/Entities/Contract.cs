using System.ComponentModel.DataAnnotations.Schema;

namespace agapay_backend.Entities
{
  public enum ContractStatus
  {
    Draft,
    PendingConfirmation,
    Active,
    Completed,
    Cancelled,
    Expired,
    Terminated
  }

  public class Contract
  {
    public int Id { get; set; }

    [ForeignKey("PatientId")]
    public int PatientId { get; set; }
    public Patient? Patient { get; set; }

    [ForeignKey("PhysicalTherapistId")]
    public int PhysicalTherapistId { get; set; }
    public PhysicalTherapist? PhysicalTherapist { get; set; }

    public DateTime StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public ContractStatus Status { get; set; } = ContractStatus.Active;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Contract end information
    public string? ContractEndReason { get; set; }
    public DateTime? ContractEndedAt { get; set; }

    // -----------------------
    // Session blueprint fields
    // -----------------------
    // Set primarily by therapist; patient confirms to activate contract
    public string? CaseToTreat { get; set; }
    // Comma-separated days (e.g., "Saturday, Monday")
    public string? SessionDays { get; set; }
    public TimeOnly? SessionStartTime { get; set; }
    public TimeOnly? SessionEndTime { get; set; }
    // Specific date proposed by therapist (if set, this takes priority over SessionDays for initial session)
    public DateTime? ProposedSessionDate { get; set; }

    // Cost breakdown
    public decimal? ProfessionalFee { get; set; }
    public decimal? LocationFee { get; set; }
    public decimal? MiscellaneousFee { get; set; }
    public decimal? TotalFee { get; set; }

    // Timestamps for workflow
    public DateTime? BlueprintProposedAt { get; set; }
    public DateTime? BlueprintConfirmedAt { get; set; }

    // Navigation
    public ICollection<TherapySession> Sessions { get; set; } = new List<TherapySession>();
  }
}
