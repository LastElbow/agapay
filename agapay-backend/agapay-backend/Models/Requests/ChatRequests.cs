using System;

namespace agapay_backend.Models.Requests
{
  /// <summary>
  /// Request/binding models extracted from ChatController. Property names and
  /// JSON shapes are unchanged — clients bind to these exact fields.
  /// </summary>

  public class BlockRequest
  {
    public string? Reason { get; set; }
    public DateTime? ExpiresAt { get; set; }
  }

  public class ReportRequest
  {
    public string? OtherUserId { get; set; }
    public int? ConversationId { get; set; }
    public int? MessageId { get; set; }
    public string Category { get; set; } = string.Empty;
    public string? Notes { get; set; }
  }
}
