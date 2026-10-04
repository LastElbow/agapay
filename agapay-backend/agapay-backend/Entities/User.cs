using Microsoft.AspNetCore.Identity;

namespace agapay_backend.Entities
{
  public class User : IdentityUser<Guid>
  {
    public required string FirstName { get; set; }
    public required string LastName { get; set; }
    public DateOnly DateOfBirth { get; set; }
    public string? Gender { get; set; }
    public string? ProfilePictureUrl { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public string? RefreshToken { get; set; }
    public DateTime? RefreshTokenExpiryTime { get; set; }

    // Preferred landing role when user has multiple roles (e.g., "Patient" or "PhysicalTherapist")
    public string? PreferredRole { get; set; }

    // Account status and moderation
    public string AccountStatus { get; set; } = "Active"; // Active, Suspended, Banned
    public string? SuspensionReason { get; set; }
    public DateTime? SuspendedAt { get; set; }
    public DateTime? SuspendedUntil { get; set; }
    public int WarningCount { get; set; } = 0;

    // Nav Props
    public ICollection<Patient> Patients { get; set; } = new List<Patient>();
    public PhysicalTherapist? PhysicalTherapist { get; set; }
  }
}
