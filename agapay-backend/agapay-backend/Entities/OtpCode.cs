using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace agapay_backend.Entities
{
  public class OtpCode
  {
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid UserId { get; set; }

    public User User { get; set; } = null!;

    /// <summary>
    /// Stored hash of the OTP value. Persisted column is named Code for compatibility.
    /// </summary>
    [Column("Code")]
    [MaxLength(128)]
    public required string CodeHash { get; set; }

    [Required]
    public OtpPurpose Purpose { get; set; }

    [Required]
    public DateTime ExpirationTime { get; set; }

    [Required]
    public DateTime CreatedAt { get; set; }

    public DateTime? UsedAt { get; set; }

    [MaxLength(256)]
    public string? Metadata { get; set; }
  }
}

