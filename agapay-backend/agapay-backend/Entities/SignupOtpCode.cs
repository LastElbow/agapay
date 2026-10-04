using System.ComponentModel.DataAnnotations;

namespace agapay_backend.Entities
{
  public class SignupOtpCode
  {
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(256)]
    public required string NormalizedEmail { get; set; }

    [Required]
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
