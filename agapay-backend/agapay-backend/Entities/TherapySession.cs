using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;

namespace agapay_backend.Entities
{
  public enum SessionStatus
  {
    Scheduled,
    InProgress,
    Completed,
    Cancelled,
    PendingConfirmation,
    DoneForToday,
    PendingCancellation,
    CancellationAcknowledged,
    PendingRelieverAcceptance,
    PendingRescheduleApproval
  }

  public enum CancellationInitiator
  {
    Patient,
    Therapist
  }

  public class TherapySession
  {
    public int Id { get; set; }

    [ForeignKey("PatientId")]
    public int PatientId { get; set; }
    public Patient? Patient { get; set; }

    [ForeignKey("PhysicalTherapistId")]
    public int PhysicalTherapistId { get; set; }
    public PhysicalTherapist? PhysicalTherapist { get; set; }

    // Contract linkage (parent aggregate)
    [ForeignKey("ContractId")]
    public int ContractId { get; set; }
    public Contract? Contract { get; set; }

    // Location of the patient for the session (address / display)
    public string? LocationAddress { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    // Scheduling
    public DateTime StartAt { get; set; }
    public DateTime EndAt { get; set; }
    public int DurationMinutes { get; set; }

    // Doctor's referral image (optional)
    public string? DoctorReferralImageUrl { get; set; }

    // Cost breakdown
    public decimal TotalFee { get; set; }
    public decimal PatientFee { get; set; } // portion patient needs to pay

    // Optional granular breakdown (editable by therapist)
    public decimal? ProfessionalFee { get; set; }
    public decimal? LocationFee { get; set; }
    public decimal? MiscellaneousFee { get; set; }

    // Case / condition being treated (editable by therapist)
    public string? ConditionCase { get; set; }

    // State
    public SessionStatus Status { get; set; } = SessionStatus.Scheduled;
    public string? CancellationReason { get; set; }
    public string? PatientCancellationReason { get; set; }
    public DateTime? CancellationRequestedAt { get; set; }
    public CancellationInitiator? CancelledBy { get; set; }
    public DateTime? CancelledAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Reschedule tracking
    public bool IsRescheduled { get; set; } = false;
    public DateTime? RescheduledAt { get; set; }

    // Therapist-initiated reschedule proposal (requires patient approval)
    public DateTime? ProposedRescheduleStartAt { get; set; }
    public DateTime? ProposedRescheduleEndAt { get; set; }
    public string? RescheduleProposalReason { get; set; }
    public DateTime? RescheduleProposedAt { get; set; }

    // Reliever/Substitute Therapist (for when original therapist proposes a reliever)
    public int? RelieverTherapistId { get; set; }
    public string? RelieverSubstitutionReason { get; set; }
    public bool IsRelieverProposed { get; set; } = false;
    public DateTime? RelieverProposedAt { get; set; }
    public DateTime? RelieverRespondedAt { get; set; }

    // Session number/order within the contract (1-indexed)
    public int SessionNumber { get; set; } = 1;

    // Confirmation workflow timestamps
    public DateTime? DetailsProposedAt { get; set; }
    public DateTime? DetailsConfirmedAt { get; set; }

    public ICollection<SessionLog> SessionLogs { get; set; } = new List<SessionLog>();
  }
}
