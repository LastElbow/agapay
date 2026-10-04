using System.ComponentModel.DataAnnotations;
using agapay_backend.Entities;

namespace agapay_backend.Models
{
  public class OtpRequestDto
  {
    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    public OtpPurpose Purpose { get; set; }

    public string? DeviceId { get; set; }
  }

  public class OtpVerifyDto : OtpRequestDto
  {
    [Required]
    [StringLength(6, MinimumLength = 4)]
    public string Code { get; set; } = string.Empty;

    public string? DeviceName { get; set; }

    public bool RememberDevice { get; set; }
  }

  public class OtpChallengeResponseDto
  {
    public bool RequiresOtp { get; init; } = true;
    public required string Email { get; init; }
    public required OtpPurpose Purpose { get; init; }
    public DateTime? ExpiresAtUtc { get; init; }
    public string? Message { get; init; }
    public string? RoleHint { get; init; }
  }
}
