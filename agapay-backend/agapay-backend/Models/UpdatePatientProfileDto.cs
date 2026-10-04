namespace agapay_backend.Models
{
  public class UpdatePatientProfileDto
  {
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public string? RelationshipToUser { get; set; }

    public string? Address { get; set; }
    public string? Barangay { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    public string? Gender { get; set; }
    public string? Occupation { get; set; }
    public string? ActivityLevel { get; set; }
    public string? CurrentComplaints { get; set; }

    public bool? IsActive { get; set; }
    public bool? SetAsActive { get; set; }
  }
}
