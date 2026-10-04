namespace agapay_backend.Entities
{
  public enum CurationStatus
  {
    Pending,
    Verified
  }

  public class OtherCondition
  {
    public int Id { get; set; }
    public required string Name { get; set; }
    public CurationStatus Status { get; set; } = CurationStatus.Pending;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<PhysicalTherapist> PhysicalTherapists { get; } = new List<PhysicalTherapist>();
  }
}
