using System.ComponentModel.DataAnnotations;

namespace agapay_backend.Models
{
  public class SignupRequestOtpDto
  {
    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;
  }

  public class SignupCompleteDto
  {
    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    [StringLength(6, MinimumLength = 4)]
    public string Code { get; set; } = string.Empty;

    [Required]
    public string Role { get; set; } = string.Empty; // Patient | PhysicalTherapist

    [Required]
    public string FirstName { get; set; } = string.Empty;

    [Required]
    public string LastName { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;

    public DateOnly DateOfBirth { get; set; }

    public string? Gender { get; set; }

    // Therapist-only
    public string? LicenseNumber { get; set; }

    public string? WorkPhoneNumber { get; set; }
  }
}
