using System;

namespace agapay_backend.Entities
{
  public class Report
  {
    public int Id { get; set; }
    public Guid ReporterUserId { get; set; }
    public Guid ReportedUserId { get; set; }
    public int? ConversationId { get; set; }
    public int? MessageId { get; set; }
    public string Category { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public string Status { get; set; } = "New";
    public string Priority { get; set; } = "Medium"; // Low, Medium, High, Critical
    public string? AdminNotes { get; set; } // Internal admin notes
    public string? ResolutionSummary { get; set; } // Summary when resolving
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public Guid? ReviewedBy { get; set; }
    public DateTime? ReviewedAt { get; set; }
  }
}
