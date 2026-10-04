namespace agapay_backend.Entities
{
  /// <summary>
  /// Represents a trusted colleague relationship between two therapists.
  /// This is a many-to-many relationship allowing therapists to build their professional network.
  /// </summary>
  public class TherapistColleague
  {
    /// <summary>
    /// The ID of the therapist who added the colleague to their network
    /// </summary>
    public int TherapistId { get; set; }
    
    /// <summary>
    /// Navigation property to the therapist who owns this connection
    /// </summary>
    public PhysicalTherapist Therapist { get; set; } = null!;

    /// <summary>
    /// The ID of the colleague being added to the network
    /// </summary>
    public int ColleagueId { get; set; }
    
    /// <summary>
    /// Navigation property to the colleague therapist
    /// </summary>
    public PhysicalTherapist Colleague { get; set; } = null!;

    /// <summary>
    /// When this colleague was added to the network
    /// </summary>
    public DateTime AddedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Optional notes about this colleague (e.g., "Met at conference", "Excellent with neurological cases")
    /// </summary>
    public string? Notes { get; set; }

    /// <summary>
    /// The status of the colleague relationship (Pending/Accepted)
    /// </summary>
    public ColleagueStatus Status { get; set; } = ColleagueStatus.Pending;
  }
}
