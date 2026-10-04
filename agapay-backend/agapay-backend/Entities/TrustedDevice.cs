using System.ComponentModel.DataAnnotations;

namespace agapay_backend.Entities
{
  public class TrustedDevice
  {
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid UserId { get; set; }

    public User User { get; set; } = null!;

    [Required]
    [MaxLength(128)]
    public string DeviceId { get; set; } = string.Empty;

    [MaxLength(256)]
    public string? DeviceName { get; set; }

    [Required]
    public DateTime CreatedAt { get; set; }

    [Required]
    public DateTime LastSeenAt { get; set; }

    [Required]
    public DateTime ExpiresAt { get; set; }

    public bool IsRevoked { get; set; }
  }
}

