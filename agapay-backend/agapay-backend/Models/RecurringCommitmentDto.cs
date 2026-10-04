namespace agapay_backend.Models
{
  public class RecurringCommitmentDto
  {
    public int ContractId { get; set; }
    public int DayOfWeek { get; set; }
    public string StartTime { get; set; } = string.Empty;
    public string EndTime { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
  }
}
