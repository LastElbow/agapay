using agapay_backend.Entities;

namespace agapay_backend.Models
{
  public class OtherConditionDto
  {
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public int TherapistCount { get; set; }
  }

  public class UpdateOtherConditionDto
  {
    public string? Name { get; set; }
    public string? Status { get; set; }
  }

  public class MergeOtherConditionsDto
  {
    public int SourceConditionId { get; set; }
    public int DestinationConditionId { get; set; }
  }
}
