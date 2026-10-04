namespace agapay_backend.Models
{
  public class UserDto
  {
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public DateOnly DateOfBirth { get; set; }
    public List<string> Roles { get; set; } = new();
    public string UserType { get; set; } = string.Empty;
    public bool IsPatientOnboardingComplete { get; set; }
    public bool IsTherapistOnboardingComplete { get; set; }
    public string? PreferredRole { get; set; }
    public string? TherapistVerificationStatus { get; set; }
  }
}
