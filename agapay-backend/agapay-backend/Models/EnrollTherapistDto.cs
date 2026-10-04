namespace agapay_backend.Models
{
  public class EnrollTherapistDto
  {
    public string LicenseNumber { get; set; } = string.Empty;
    public string? WorkPhoneNumber { get; set; }
    public string? Gender { get; set; }
  }
}
